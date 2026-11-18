/**
 * test/test-lanzar-id-namespace-isolation.js
 *
 * PYTHOS PHASE XXI (Priority One): LANZAR ID Firestore Identity Isolation Suite
 * Verifies that PYTHOS_ENV=staging isolates all identity reads, writes, linking,
 * and deletions to users_staging/{uid} and pythos/app_staging/lanzar_id_accounts,
 * leaving production users/{uid} and pythos/app untouched.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const lanzarIdService = require('../server/lanzarIdService');
const firestoreService = require('../server/firestoreService');
const firestoreNamespace = require('../server/firestoreNamespace');

function createMockIdentityDb(seedDocs = {}, recordedOps = []) {
  const store = { ...seedDocs };
  function makeDoc(col, id) {
    const fullPath = `${col}/${id}`;
    return {
      _path: fullPath,
      collection(sub) {
        return makeCol(`${fullPath}/${sub}`);
      },
      async get() {
        recordedOps.push({ op: 'read', path: fullPath });
        if (Object.prototype.hasOwnProperty.call(store, fullPath)) {
          return { exists: true, data: () => ({ ...store[fullPath] }) };
        }
        return { exists: false, data: () => null };
      },
      async set(data, opts) {
        recordedOps.push({ op: 'write', path: fullPath, data });
        store[fullPath] = opts && opts.merge && store[fullPath]
          ? { ...store[fullPath], ...data }
          : { ...data };
      },
      async update(data) {
        recordedOps.push({ op: 'update', path: fullPath, data });
        store[fullPath] = { ...(store[fullPath] || {}), ...data };
      },
      async delete() {
        recordedOps.push({ op: 'delete', path: fullPath });
        delete store[fullPath];
      }
    };
  }
  function makeCol(prefix) {
    return {
      doc(id) { return makeDoc(prefix, id); },
      where() { return this; },
      limit() { return this; },
      orderBy() { return this; },
      async get() {
        recordedOps.push({ op: 'query', path: prefix });
        return { empty: true, docs: [], forEach() {} };
      }
    };
  }
  return {
    store,
    collection(name) { return makeCol(name); },
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
  console.log('PYTHOS PHASE XXI: LANZAR ID IDENTITY ISOLATION SUITE');
  console.log('======================================================================\n');

  const prevEnv = process.env.PYTHOS_ENV;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pythos-lanzar-iso-'));
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

  await test('Production identity lookup reads users/{uid} unchanged', async () => {
    process.env.PYTHOS_ENV = 'production';
    const ops = [];
    const db = createMockIdentityDb({
      'users/prod_uid_1': { pythosLegacyUid: 'legacy_prod_1', status: 'active', email: 'prod@example.com' }
    }, ops);
    lanzarIdService.setIdentityDbForTesting(db);

    const resolved = await lanzarIdService.resolveCanonicalIdentity({ uid: 'prod_uid_1', email: 'prod@example.com' });
    assert.strictEqual(resolved.uid, 'prod_uid_1');
    assert.strictEqual(resolved.pythosLegacyUid, 'legacy_prod_1');
    assert(ops.some(o => o.op === 'read' && o.path === 'users/prod_uid_1'));
    assert(!ops.some(o => o.path.startsWith('users_staging/')));
  });

  await test('Staging identity lookup uses users_staging/{uid} and cannot read production users/{uid}', async () => {
    process.env.PYTHOS_ENV = 'staging';
    const ops = [];
    const db = createMockIdentityDb({
      'users/shared_uid_99': { pythosLegacyUid: 'PROD_SECRET_LEGACY', status: 'suspended' },
      'users_staging/shared_uid_99': { pythosLegacyUid: 'STAGING_LEGACY_99', status: 'active' }
    }, ops);
    lanzarIdService.setIdentityDbForTesting(db);

    const resolved = await lanzarIdService.resolveCanonicalIdentity({ uid: 'shared_uid_99', email: 'test@example.com' });
    assert.strictEqual(resolved.pythosLegacyUid, 'STAGING_LEGACY_99');
    assert.strictEqual(resolved.status, 'active');
    assert(ops.every(o => !o.path.startsWith('users/')), `Staging must never read users/: ${JSON.stringify(ops)}`);
  });

  await test('Staging identity write/link/delete never touch production users/ or pythos/app', async () => {
    process.env.PYTHOS_ENV = 'staging';
    const ops = [];
    const db = createMockIdentityDb({
      'users/p21_staging_u1': { pythosLegacyUid: 'DO_NOT_TOUCH_PROD' }
    }, ops);
    lanzarIdService.setIdentityDbForTesting(db);
    firestoreService.setFirestoreAdapterForTesting({ db, isAvailable: true });
    lanzarIdService.resolveStorePaths(tmpDir);

    const docRef = lanzarIdService.getIdentityDocRef(db, 'p21_staging_u1');
    assert.strictEqual(docRef._path, 'users_staging/p21_staging_u1');
    await docRef.set({ pythosLegacyUid: 'lanzar_stg_1', email: 'stg1@lanzar.test' }, { merge: true });

    await firestoreService.saveLanzarAccount({
      uid: 'lanzar_stg_1',
      email: 'stg1@lanzar.test',
      displayName: 'Staging One'
    });
    await firestoreService.deleteLanzarAccount('lanzar_stg_1');

    assert.strictEqual(db.store['users/p21_staging_u1'].pythosLegacyUid, 'DO_NOT_TOUCH_PROD');
    assert(ops.every(o => !o.path.startsWith('users/') && !o.path.startsWith('pythos/app/')));
    assert(ops.some(o => o.op === 'write' && o.path === 'users_staging/p21_staging_u1'));
    assert(ops.some(o => o.op === 'write' && o.path === 'pythos/app_staging/lanzar_id_accounts/lanzar_stg_1'));
    assert(ops.some(o => o.op === 'delete' && o.path === 'pythos/app_staging/lanzar_id_accounts/lanzar_stg_1'));
  });

  await test('Different staging identities remain isolated & Firebase/LANZAR mappings stay consistent', async () => {
    process.env.PYTHOS_ENV = 'staging';
    const ops = [];
    const db = createMockIdentityDb({
      'users_staging/fb_stg_a': { pythosLegacyUid: 'lanzar_stg_a', email: 'a@lanzar.test' },
      'users_staging/fb_stg_b': { pythosLegacyUid: 'lanzar_stg_b', email: 'b@lanzar.test' }
    }, ops);
    lanzarIdService.setIdentityDbForTesting(db);

    const resA = await lanzarIdService.resolveCanonicalIdentity({ uid: 'fb_stg_a', email: 'a@lanzar.test' });
    const resB = await lanzarIdService.resolveCanonicalIdentity({ uid: 'fb_stg_b', email: 'b@lanzar.test' });
    assert.strictEqual(resA.pythosLegacyUid, 'lanzar_stg_a');
    assert.strictEqual(resB.pythosLegacyUid, 'lanzar_stg_b');
    assert.notStrictEqual(resA.uid, resB.uid);
  });

  await test('Invalid PYTHOS_ENV fails closed in getIdentityCollectionName', async () => {
    process.env.PYTHOS_ENV = 'staging_typo_bad';
    assert.throws(() => firestoreNamespace.getIdentityCollectionName(), /Invalid PYTHOS_ENV/);
  });

  lanzarIdService.setIdentityDbForTesting(null);
  firestoreService.setFirestoreAdapterForTesting(null);
  if (prevEnv === undefined) delete process.env.PYTHOS_ENV;
  else process.env.PYTHOS_ENV = prevEnv;
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}

  console.log(`\nSUMMARY: ${passed}/${total} LANZAR ID identity isolation tests passed.`);
}

runTests().catch(err => {
  console.error('Fatal LANZAR ID isolation test error:', err);
  process.exit(1);
});
