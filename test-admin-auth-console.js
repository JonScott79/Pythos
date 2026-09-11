/**
 * test-admin-auth-console.js
 *
 * Dedicated Automated Test Suite for Pythos #3 Admin Console & Authentication.
 *
 * Covers:
 * 1. Unauthenticated request handling in production vs development.
 * 2. Authenticated non-admin rejection (valid token, not in /admins or active: false -> 403).
 * 3. Authenticated active admin approval (valid token, in /admins with active: true -> 200).
 * 4. Expired/invalid Firebase token handling (invalid JWT -> unauthorized / forbidden).
 * 5. Admin API endpoints: GET /admin/auth/verify, GET /admin/reports, GET /admin/reports/:id, PATCH review.
 * 6. Appropriate failure states (invalid review status -> 400, report not found -> 404).
 */

const assert = require('assert');
const express = require('./server/node_modules/express');
const adminRoutes = require('./server/adminRoutes');
const firebaseAdmin = require('./server/firebaseAdmin');
const reportService = require('./server/reportService');

console.log('====================================================');
console.log('🏛️ PYTHOS ADMIN AUTHENTICATION & CONSOLE API SUITE');
console.log('====================================================\n');

// Mock helpers
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRoutes);
  return app;
}

// Simple test request dispatcher using supertest-like in-memory simulation
function simulateRequest(app, method, url, headers = {}, body = null) {
  return new Promise((resolve) => {
    const http = require('http');
    const server = http.createServer(app);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const req = http.request({
        host: '127.0.0.1',
        port,
        path: url,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      }, (res) => {
        let raw = '';
        res.on('data', chunk => raw += chunk);
        res.on('end', () => {
          server.close();
          let json = null;
          try { json = JSON.parse(raw); } catch (_) {}
          resolve({ status: res.statusCode, headers: res.headers, body: json, text: raw });
        });
      });

      if (body) {
        req.write(typeof body === 'string' ? body : JSON.stringify(body));
      }
      req.end();
    });
  });
}

async function runTests() {
  const originalEnv = process.env.NODE_ENV;
  const originalKey = process.env.ADMIN_API_KEY;
  const originalVerify = firebaseAdmin.verifyIdToken;
  const originalIsAdmin = firebaseAdmin.isFirestoreAdmin;
  const originalIsSdkAvailable = firebaseAdmin.isAdminSdkAvailable;

  const testApp = createTestApp();

  try {
    // -------------------------------------------------------------
    // Test 1: Production lockout for unauthenticated requests
    // -------------------------------------------------------------
    console.log('▶ [TEST 1] Production Lockout for Unauthenticated Requests');
    process.env.NODE_ENV = 'production';
    delete process.env.ADMIN_API_KEY;

    const resUnauth = await simulateRequest(testApp, 'GET', '/admin/metrics');
    assert.strictEqual(resUnauth.status, 403, 'Unauthenticated in production must return 403');
    assert.strictEqual(resUnauth.body?.error, 'forbidden');
    console.log('  Status: ✅ PASSED (403 Forbidden enforced)\n');

    // -------------------------------------------------------------
    // Test 2: Authenticated Non-Admin Rejection (403)
    // -------------------------------------------------------------
    console.log('▶ [TEST 2] Authenticated Non-Admin User (Token valid, not in /admins)');
    firebaseAdmin.isAdminSdkAvailable = () => true;
    firebaseAdmin.verifyIdToken = async (token) => {
      if (token === 'student_jwt_token.with.dots') {
        return { uid: 'student_uid_123', email: 'student@example.edu' };
      }
      return null;
    };
    firebaseAdmin.isFirestoreAdmin = async (uid) => {
      // Non-admin user is not in /admins collection
      return false;
    };

    const resNonAdmin = await simulateRequest(testApp, 'GET', '/admin/auth/verify', {
      'Authorization': 'Bearer student_jwt_token.with.dots'
    });
    assert.strictEqual(resNonAdmin.status, 403, 'Non-admin token must return 403');
    assert.strictEqual(resNonAdmin.body?.error, 'forbidden');
    assert(resNonAdmin.body?.message?.includes('admin privileges'), 'Must explain lack of admin privileges');
    console.log('  Status: ✅ PASSED (Authenticated non-admin correctly rejected)\n');

    // -------------------------------------------------------------
    // Test 3: Authenticated Active Admin Approval (200)
    // -------------------------------------------------------------
    console.log('▶ [TEST 3] Authenticated Active Admin (Token valid + in /admins.active == true)');
    firebaseAdmin.verifyIdToken = async (token) => {
      if (token === 'admin_jwt_token.with.dots') {
        return { uid: 'admin_uid_999', email: 'lead_admin@lanzar.me' };
      }
      return null;
    };
    firebaseAdmin.isFirestoreAdmin = async (uid) => {
      return uid === 'admin_uid_999';
    };

    const resAdmin = await simulateRequest(testApp, 'GET', '/admin/auth/verify', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resAdmin.status, 200, 'Active admin must return 200');
    assert.strictEqual(resAdmin.body?.status, 'ok');
    assert.strictEqual(resAdmin.body?.authorized, true);
    assert.strictEqual(resAdmin.body?.adminUid, 'admin_uid_999');
    assert.strictEqual(resAdmin.body?.adminEmail, 'lead_admin@lanzar.me');
    console.log('  Status: ✅ PASSED (Active admin authorized and session details returned)\n');

    // -------------------------------------------------------------
    // Test 4: Expired or Invalid Firebase Token
    // -------------------------------------------------------------
    console.log('▶ [TEST 4] Expired / Invalid Firebase Token');
    firebaseAdmin.verifyIdToken = async () => null; // Token rejected by Firebase Auth

    const resExpired = await simulateRequest(testApp, 'GET', '/admin/auth/verify', {
      'Authorization': 'Bearer expired_jwt_token.with.dots'
    });
    assert.strictEqual(resExpired.status, 403, 'Invalid/expired token in production must result in lockout (403)');
    console.log('  Status: ✅ PASSED (Expired/invalid token rejected)\n');

    // -------------------------------------------------------------
    // Test 5: Admin API Access & Report Listing
    // -------------------------------------------------------------
    console.log('▶ [TEST 5] Admin Report Listing with Active Admin Token');
    firebaseAdmin.verifyIdToken = async () => ({ uid: 'admin_uid_999', email: 'lead_admin@lanzar.me' });
    firebaseAdmin.isFirestoreAdmin = async () => true;

    // Create a known sample report first
    const created = reportService.createReport({
      question: 'Integrate 2x dx',
      response: 'x^2 + C',
      model: 'pythos:latest',
      description: 'Check calculus derivation',
      source: 'student'
    });

    const resList = await simulateRequest(testApp, 'GET', '/admin/reports?limit=10', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resList.status, 200, 'Listing must succeed for admin');
    assert.strictEqual(resList.body?.status, 'ok');
    assert(Array.isArray(resList.body?.reports), 'Must return reports array');
    console.log(`  Found ${resList.body.reports.length} report(s) in listing`);
    console.log('  Status: ✅ PASSED\n');

    // -------------------------------------------------------------
    // Test 6: Report Detail Retrieval
    // -------------------------------------------------------------
    console.log('▶ [TEST 6] Admin Report Detail Retrieval & 404 on Missing');
    const resDetail = await simulateRequest(testApp, 'GET', `/admin/reports/${created.reportId}`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resDetail.status, 200);
    assert.strictEqual(resDetail.body?.report?.report_id, created.reportId);
    assert.strictEqual(resDetail.body?.report?.interaction?.question, 'Integrate 2x dx');

    // Non-existent report
    const resMissing = await simulateRequest(testApp, 'GET', '/admin/reports/PY-00000000', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resMissing.status, 404);
    assert.strictEqual(resMissing.body?.error, 'not_found');
    console.log('  Status: ✅ PASSED (Report detail retrieved and 404 properly handled)\n');

    // -------------------------------------------------------------
    // Test 7: Review Lifecycle Update & Validation
    // -------------------------------------------------------------
    console.log('▶ [TEST 7] Review Lifecycle Update & Validation Rejection');
    const resPatch = await simulateRequest(testApp, 'PATCH', `/admin/reports/${created.reportId}/review`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    }, {
      status: 'confirmed',
      notes: 'Reviewed by head of physics',
      regressionTestCreated: true
    });
    assert.strictEqual(resPatch.status, 200);
    assert.strictEqual(resPatch.body?.report?.review?.status, 'confirmed');

    // Bad status rejection
    const resBadStatus = await simulateRequest(testApp, 'PATCH', `/admin/reports/${created.reportId}/review`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    }, {
      status: 'non_existent_status_123'
    });
    assert.strictEqual(resBadStatus.status, 400);
    assert.strictEqual(resBadStatus.body?.error, 'update_failed');
    console.log('  Status: ✅ PASSED (Review status updated and bad statuses rejected with 400)\n');

    // -------------------------------------------------------------
    // Test 8: Feature Flag Switch (Toggle Student Bug Reporting)
    // -------------------------------------------------------------
    console.log('▶ [TEST 8] Administrative Feature Flag Toggle (/admin/reporting/toggle)');
    const resToggleOff = await simulateRequest(testApp, 'POST', '/admin/reporting/toggle', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    }, { enabled: false });
    assert.strictEqual(resToggleOff.status, 200);
    assert.strictEqual(resToggleOff.body?.reportingEnabled, false);
    assert.strictEqual(reportService.isReportingEnabled(), false);

    const resToggleOn = await simulateRequest(testApp, 'POST', '/admin/reporting/toggle', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    }, { enabled: true });
    assert.strictEqual(resToggleOn.status, 200);
    assert.strictEqual(resToggleOn.body?.reportingEnabled, true);
    assert.strictEqual(reportService.isReportingEnabled(), true);
    // -------------------------------------------------------------
    // Test 9: Admin Telemetry Cleanup & Queue Separation
    // -------------------------------------------------------------
    console.log('▶ [TEST 9] Admin Reports Queue Filtering (User Only vs. System vs. Test Exclusion)');
    // 1. User reports only: GET /admin/reports?source=student
    const resUserOnly = await simulateRequest(testApp, 'GET', '/admin/reports?source=student', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resUserOnly.status, 200);
    assert(resUserOnly.body.reports.every(r => r.source === 'student'), 'All reports in user queue must have source === student');

    // 2. Default queue: GET /admin/reports (excludes test reports by default)
    const resDefault = await simulateRequest(testApp, 'GET', '/admin/reports', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resDefault.status, 200);
    assert(resDefault.body.reports.every(r => r.source !== 'test'), 'Default queue must not include test reports');

    // 3. System auto-flags queue: GET /admin/reports?source=system_auto_flag
    const resSystem = await simulateRequest(testApp, 'GET', '/admin/reports?source=system_auto_flag', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resSystem.status, 200);
    assert(resSystem.body.reports.every(r => r.source === 'system_auto_flag'), 'All reports in system queue must have source === system_auto_flag');

    // 4. Test fixture reports queue: GET /admin/reports?source=test&includeTest=true
    const resTests = await simulateRequest(testApp, 'GET', '/admin/reports?source=test&includeTest=true', {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resTests.status, 200);
    assert(resTests.body.reports.every(r => r.source === 'test'), 'All reports in test queue must have source === test');
    console.log('  Status: ✅ PASSED (User reports cleanly isolated from tests and system flags)\n');

    // Test 10: DELETE /admin/reports/:reportId
    console.log('▶ [TEST 10] Admin DELETE /admin/reports/:reportId Endpoint');
    const deleteTarget = reportService.createReport({
      question: 'Delete me',
      response: 'Delete response',
      source: 'student'
    });

    const resDel = await simulateRequest(testApp, 'DELETE', `/admin/reports/${deleteTarget.reportId}`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resDel.status, 200, 'DELETE should return 200 on success');
    assert.strictEqual(resDel.body.status, 'ok');

    // Subsequent GET should return 404
    const resGetAfterDel = await simulateRequest(testApp, 'GET', `/admin/reports/${deleteTarget.reportId}`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resGetAfterDel.status, 404, 'Deleted report should return 404');
    console.log('  Status: ✅ PASSED (Admin delete endpoint removes report cleanly)\n');

    // Test 11: Export Endpoints (/admin/reports/:id/export & /admin/reports-export)
    console.log('▶ [TEST 11] Admin Export Endpoints (Single Markdown/JSON & Queue Bundle)');
    const exportTarget = reportService.createReport({
      question: 'Integrate x dx from 0 to 2',
      response: 'The integral evaluates to 2.',
      source: 'student'
    });

    // 1. Single report export as Markdown
    const resMd = await simulateRequest(testApp, 'GET', `/admin/reports/${exportTarget.reportId}/export?format=markdown`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resMd.status, 200);
    assert(resMd.headers['content-type'].includes('text/markdown'));
    assert(resMd.text.includes('# Pythos Incident Dossier: ' + exportTarget.reportId));

    // 2. Single report export as JSON
    const resJson = await simulateRequest(testApp, 'GET', `/admin/reports/${exportTarget.reportId}/export?format=json`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resJson.status, 200);
    assert.strictEqual(resJson.body.report_id, exportTarget.reportId);

    // 3. Batch export bundle
    const resBundle = await simulateRequest(testApp, 'GET', `/admin/reports-export?source=student`, {
      'Authorization': 'Bearer admin_jwt_token.with.dots'
    });
    assert.strictEqual(resBundle.status, 200);
    assert(Array.isArray(resBundle.body.reports));
    assert(resBundle.body.reports.some(r => r.report_id === exportTarget.reportId));
    console.log('  Status: ✅ PASSED (Single report and bundle exports verified)\n');

    // Clean up
    await reportService.deleteReport(exportTarget.reportId);

  } finally {
    process.env.NODE_ENV = originalEnv;
    if (originalKey) process.env.ADMIN_API_KEY = originalKey;
    else delete process.env.ADMIN_API_KEY;
    firebaseAdmin.verifyIdToken = originalVerify;
    firebaseAdmin.isFirestoreAdmin = originalIsAdmin;
    firebaseAdmin.isAdminSdkAvailable = originalIsSdkAvailable;
  }

  console.log('====================================================');
  console.log('📊 ALL 11 ADMIN CONSOLE & AUTH TESTS PASSED (100%)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('Admin Auth Suite Failed:', err);
  process.exit(1);
});
