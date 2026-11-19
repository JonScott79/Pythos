/**
 * test/test-firestore-namespace-isolation.js
 *
 * PYTHOS PHASE XXI (Priority One): Automated Firestore Namespace Isolation Tests
 * Verifies that PYTHOS_ENV=staging routes all reads, writes, updates, deletes,
 * batches, and tool queries to *_staging namespaces, production preserves
 * production paths, and invalid PYTHOS_ENV fails closed.
 */

const assert = require('assert');
const firestoreNamespace = require('../server/firestoreNamespace');
const firestoreService = require('../server/firestoreService');

function createMockDb(recordedOps) {
  function makeColRef(pathParts) {
    return {
      _path: pathParts.join('/'),
      doc(id) {
        return makeDocRef([...pathParts, id]);
      },
      orderBy() { return this; },
      limit() { return this; },
      where() { return this; },
      async get() {
        recordedOps.push({ op: 'query', path: pathParts.join('/') });
        return { empty: true, forEach() {}, docs: [] };
      }
    };
  }
  function makeDocRef(pathParts) {
    const fullPath = pathParts.join('/');
    return {
      _path: fullPath,
      collection(sub) {
        return makeColRef([...pathParts, sub]);
      },
      async get() {
        recordedOps.push({ op: 'read', path: fullPath });
        return { exists: false, data: () => null };
      },
      async set(data) {
        recordedOps.push({ op: 'write', path: fullPath, data });
      },
      async update(data) {
        recordedOps.push({ op: 'update', path: fullPath, data });
      },
      async delete() {
        recordedOps.push({ op: 'delete', path: fullPath });
      }
    };
  }
  return {
    collection(name) {
      return makeColRef([name]);
    },
    batch() {
      const ops = [];
      return {
        delete(ref) { ops.push({ op: 'batch_delete', path: ref._path }); },
        async commit() { recordedOps.push(...ops); }
      };
    }
  };
}

async function runTests() {
  console.log('======================================================================');
  console.log('PYTHOS PHASE XXI: FIRESTORE NAMESPACE ISOLATION SUITE');
  console.log('======================================================================\n');

  const prevEnv = process.env.PYTHOS_ENV;
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`  ✓ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ [FAIL] ${name}`);
      console.error(`    ${err.message}`);
      process.exitCode = 1;
    }
  }

  await test('PYTHOS_ENV=staging resolves all 4 namespace targets to staging collections', async () => {
    process.env.PYTHOS_ENV = 'staging';
    const ns = firestoreNamespace.resolveFirestoreNamespaces();
    assert.strictEqual(ns.isStaging, true);
    assert.strictEqual(ns.anchorDoc, 'app_staging');
    assert.strictEqual(ns.memoryCollection, 'pythos_memory_staging');
    assert.strictEqual(ns.learningCollection, 'pythos_learning_staging');
    assert.strictEqual(ns.chatsCollection, 'pythos_chats_staging');
  });

  await test('PYTHOS_ENV=staging routes firestoreService reads/writes/updates/deletes to app_staging & pythos_chats_staging only', async () => {
    process.env.PYTHOS_ENV = 'staging';
    const ops = [];
    const mockDb = createMockDb(ops);
    firestoreService.setFirestoreAdapterForTesting({ db: mockDb, isAvailable: true });

    await firestoreService.ensurePythosNamespace();
    await firestoreService.saveBugReport('rep_p21_1', { title: 'Test' }, 'p21_user');
    await firestoreService.getBugReport('rep_p21_1');
    await firestoreService.updateBugReportReview('rep_p21_1', { status: 'reviewed' });
    await firestoreService.deleteBugReport('rep_p21_1');
    await firestoreService.deleteUserChats('p21_user');

    firestoreService.setFirestoreAdapterForTesting(null);

    assert(ops.length > 0, 'Expected recorded Firestore ops');
    for (const o of ops) {
      assert(!o.path.startsWith('pythos/app/'), `Staging touched production pythos/app path: ${o.path}`);
      assert(o.path !== 'pythos/app', `Staging touched production anchor doc: ${o.path}`);
      assert(!o.path.includes('/pythos_chats/') && !o.path.endsWith('/pythos_chats'), `Staging touched production pythos_chats: ${o.path}`);
      assert(o.path !== 'users/p21_user', `Staging deleteUserChats must NOT delete root users/{uid} doc`);
    }
    assert(ops.some(o => o.op === 'write' && o.path === 'pythos/app_staging/bug_reports/rep_p21_1'));
    assert(ops.some(o => o.op === 'query' && o.path === 'users/p21_user/pythos_chats_staging'));
  });

  await test('Production (PYTHOS_ENV unset or production) preserves production paths', async () => {
    delete process.env.PYTHOS_ENV;
    let ns = firestoreNamespace.resolveFirestoreNamespaces();
    assert.strictEqual(ns.isStaging, false);
    assert.strictEqual(ns.anchorDoc, 'app');
    assert.strictEqual(ns.memoryCollection, 'pythos_memory');
    assert.strictEqual(ns.learningCollection, 'pythos_learning');
    assert.strictEqual(ns.chatsCollection, 'pythos_chats');

    process.env.PYTHOS_ENV = 'production';
    ns = firestoreNamespace.resolveFirestoreNamespaces();
    assert.strictEqual(ns.anchorDoc, 'app');
  });

  await test('Invalid PYTHOS_ENV fails closed instead of selecting production namespace', async () => {
    process.env.PYTHOS_ENV = 'invalid_typo_env';
    assert.throws(() => firestoreNamespace.resolveFirestoreNamespaces(), /Invalid PYTHOS_ENV/);
  });

  if (prevEnv === undefined) delete process.env.PYTHOS_ENV;
  else process.env.PYTHOS_ENV = prevEnv;

  console.log(`\nSUMMARY: ${passed}/${total} Firestore namespace isolation tests passed.`);
}

runTests().catch(err => {
  console.error('Fatal namespace test error:', err);
  process.exit(1);
});
