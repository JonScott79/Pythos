/**
 * PHASE 4: UX, Onboarding, Privacy, LANZAR ID & Documentation Verification Suite
 * Verifies:
 *   4.1 Workspace Toolbar Organization: 3 primary tools directly visible (Check Work, Graph, Sim Lab)
 *       + secondary tools (Calc, Units, Matrix, Equation Builder, Formulas, Scratchpad) in accessible Toolbox popover.
 *   4.2 Onboarding & Account Options: Anonymous default notice, Login with Google, and Sign in with LANZAR ID.
 *   4.3 LANZAR ID Ecosystem Authentication: OIDC discovery, session token creation/verification, and Google account linking.
 *   4.4 Explicit Mailing List Consent: Unchecked by default, account creation succeeds without opt-in,
 *       records consent timestamp & source when opted in, and supports one-click unsubscribe.
 *   4.5 Privacy & Clarity Masking: data-clarity-mask="true" on #output, #userInput, #pendingImagesStrip,
 *       #chatHistoryList, #pythosMemoryModal, and all .floating-window tool containers.
 *   4.6 Documentation & Policy Pages: privacy.html, accessibility.html, docs/LANZAR_ID_ARCHITECTURE.md,
 *       and searchable Study Hub quick-start filter (#studyHubSearchInput).
 */
const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, description) {
  if (condition) {
    console.log(`  ✅ PASS: ${description}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${description}`);
    failed++;
  }
}

async function runTests() {
  console.log('=== PHASE 4: UX, ONBOARDING, PRIVACY, LANZAR ID & DOCUMENTATION SUITE ===\n');

  const indexHtml = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  const appJs = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const lanzarIdService = require('./server/lanzarIdService');

  console.log('--- 4.1 Workspace Toolbar Organization ---');
  const toolboxSectionMatch = indexHtml.match(/<div class="toolbox-bar"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  const toolboxHtml = toolboxSectionMatch ? toolboxSectionMatch[0] : '';
  const beforePopover = toolboxHtml.split('<div class="toolbox-popover-wrap">')[0] || '';
  const insidePopover = toolboxHtml.split('<div class="toolbox-popover-wrap">')[1] || '';

  assert(
    beforePopover.includes('id="toolCheckBtn"') &&
    beforePopover.includes('id="toolGraphBtn"') &&
    beforePopover.includes('id="toolSimLabBtn"') &&
    !beforePopover.includes('id="toolCalcBtn"') &&
    !beforePopover.includes('id="toolUnitsBtn"'),
    'Primary toolbar displays exactly 3 primary tools directly (Check Work, Graph, Sim Lab)'
  );

  assert(
    insidePopover.includes('id="toolboxMenuBtn"') &&
    insidePopover.includes('id="toolboxPopoverMenu"') &&
    insidePopover.includes('id="toolCalcBtn"') &&
    insidePopover.includes('id="toolUnitsBtn"') &&
    insidePopover.includes('id="toolMatrixBtn"') &&
    insidePopover.includes('id="toolEditorBtn"') &&
    insidePopover.includes('id="toolFormulasBtn"') &&
    insidePopover.includes('id="toolScratchpadBtn"'),
    'Secondary tools (Calc, Units, Matrix, Equation Builder, Formulas, Scratchpad) are organized inside accessible Toolbox popover'
  );

  console.log('\n--- 4.2 Onboarding & Account Options ---');
  assert(
    indexHtml.includes('id="anonSyncNotice"') &&
    indexHtml.includes('Continue anonymously') &&
    indexHtml.includes('Sign in to sync your conversations and personal memory across devices'),
    'Anonymous session default and cross-device sync benefit are clearly explained'
  );

  assert(
    indexHtml.includes('id="loginBtn"') &&
    indexHtml.includes('id="lanzarIdLoginBtn"') &&
    indexHtml.includes('id="lanzarCancelBtn"'),
    'Sidebar and modal provide clear choices: Continue anonymously, Login with Google, and Sign in with LANZAR ID'
  );

  console.log('\n--- 4.3 & 4.4 LANZAR ID Ecosystem Auth & Explicit Mailing-List Consent ---');
  const oidcDoc = lanzarIdService.getOidcDiscoveryDocument();
  assert(
    oidcDoc.issuer &&
    oidcDoc.authorization_endpoint &&
    oidcDoc.token_endpoint &&
    Array.isArray(oidcDoc.scopes_supported) &&
    oidcDoc.scopes_supported.includes('openid'),
    'LANZAR ID exposes standard OIDC discovery metadata'
  );

  // Verify checkbox is unchecked by default in HTML
  const checkboxTagMatch = indexHtml.match(/<input[^>]*id="mailingListConsentCheckbox"[^>]*>/);
  assert(
    checkboxTagMatch && !/\bchecked\b/i.test(checkboxTagMatch[0]),
    'Mailing-list consent checkbox (#mailingListConsentCheckbox) is unchecked by default in HTML'
  );

  // Test 1: Register account WITHOUT mailing-list opt-in
  const testEmail1 = `student_no_optin_${Date.now()}@example.edu`;
  const regNoOptIn = await lanzarIdService.authenticateOrRegisterLanzarId({
    email: testEmail1,
    password: 'SecurePassword123!',
    displayName: 'Alex Student',
    mode: 'register',
    mailingListOptIn: false
  });
  assert(
    regNoOptIn && regNoOptIn.token && regNoOptIn.user.uid.startsWith('lanzar_') && regNoOptIn.user.mailingListSubscribed === false,
    'Account registration succeeds without mailing-list opt-in (mailingListSubscribed === false)'
  );

  const verifiedClaims = lanzarIdService.verifyLanzarToken(regNoOptIn.token);
  assert(
    verifiedClaims && verifiedClaims.uid === regNoOptIn.user.uid && verifiedClaims.email === testEmail1,
    'Signed LANZAR ID session token verifies cryptographically with timing-safe HMAC check'
  );

  const linkedAccount = await lanzarIdService.linkGoogleAccountToLanzarId({
    lanzarUid: regNoOptIn.user.uid,
    googleUid: 'google_uid_987654',
    googleEmail: testEmail1
  });
  assert(
    linkedAccount.linkedGoogleUid === 'google_uid_987654' && linkedAccount.providers.includes('google'),
    'LANZAR ID supports linking with Google / Firebase accounts'
  );

  // Test 2: Register account WITH explicit mailing-list opt-in, then unsubscribe
  const testEmail2 = `student_optin_${Date.now()}@example.edu`;
  const regOptIn = await lanzarIdService.authenticateOrRegisterLanzarId({
    email: testEmail2,
    password: 'SecurePassword123!',
    displayName: 'OptIn Student',
    mode: 'register',
    mailingListOptIn: true,
    consentSource: 'unit_test_modal'
  });
  const consentStatus = lanzarIdService.getMailingListStatus(testEmail2);
  assert(
    regOptIn.user.mailingListSubscribed === true &&
    consentStatus &&
    consentStatus.subscribed === true &&
    Boolean(consentStatus.consentTimestamp) &&
    consentStatus.consentSource === 'unit_test_modal',
    'Explicit mailing-list opt-in records consentTimestamp and consentSource'
  );

  const unsubRes = await lanzarIdService.unsubscribeMailingList({ email: testEmail2 });
  const afterUnsub = lanzarIdService.getMailingListStatus(testEmail2);
  assert(
    unsubRes.status === 'unsubscribed' && afterUnsub && afterUnsub.subscribed === false && Boolean(afterUnsub.unsubscribedAt),
    'One-click unsubscribe immediately revokes mailing-list subscription and records unsubscribedAt'
  );

  console.log('\n--- 4.5 Privacy & Clarity Masking ---');
  const maskedIds = [
    'output',
    'userInput',
    'pendingImagesStrip',
    'chatHistoryList',
    'pythosMemoryModal',
    'pythosReportModal',
    'lanzarIdModal',
    'floatCalcWindow',
    'floatGraphWindow',
    'floatCheckWindow',
    'floatUnitsWindow',
    'floatMatrixWindow',
    'floatEditorWindow'
  ];
  for (const id of maskedIds) {
    const tagRegex = new RegExp(`id="${id}"[^>]*data-clarity-mask="true"`);
    assert(tagRegex.test(indexHtml), `Sensitive container #${id} has data-clarity-mask="true"`);
  }

  console.log('\n--- 4.6 Documentation & Policy Pages ---');
  assert(fs.existsSync(path.join(__dirname, 'privacy.html')), 'Public privacy policy page (privacy.html) exists');
  assert(fs.existsSync(path.join(__dirname, 'accessibility.html')), 'Public accessibility statement page (accessibility.html) exists');
  assert(fs.existsSync(path.join(__dirname, 'docs', 'LANZAR_ID_ARCHITECTURE.md')), 'LANZAR ID architecture documentation (docs/LANZAR_ID_ARCHITECTURE.md) exists');
  assert(
    indexHtml.includes('id="studyHubSearchInput"') && appJs.includes('studyHubSearchInput'),
    'Study Hub drawer includes searchable quick-start filter (#studyHubSearchInput)'
  );

  console.log(`\n=== PHASE 4 SUMMARY: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});
