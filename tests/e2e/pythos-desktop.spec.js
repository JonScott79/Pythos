const { test, expect } = require('@playwright/test');
const {
  attachErrorCollectors,
  waitForMathLibs,
  sendChatPrompt,
  assertNoViewportOverflow
} = require('./helpers/browserAssertions');

test.describe('Pythos Desktop E2E User Journeys', () => {
  test('initialization, KaTeX rendering, unified Trust badge, domain restrictions & contextual handoffs', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto('/');
    await waitForMathLibs(page);

    await expect(page.locator('#welcomeOracleCard')).toBeVisible();
    await expect(page.locator('#userInput')).toBeVisible();
    await assertNoViewportOverflow(page, 'desktop initial');

    // Send trigonometric equivalence prompt verified symbolically by backend + SymPy
    const assistantMsg = await sendChatPrompt(page, 'Verify csc(x) = 1/sin(x)');
    await expect(assistantMsg.locator('.katex').first()).toBeVisible();

    // Only one consolidated trust badge (no duplicate top box or extra disclosure banner)
    await expect(page.locator('.pythos-trust-details')).toHaveCount(0);
    await expect(page.locator('.pythos-partial-verification-disclosure')).toHaveCount(0);

    const trustBtn = assistantMsg.locator('.msg-audit-btn');
    await expect(trustBtn).toBeVisible();
    await expect(trustBtn).toContainText(/Verified \(Symbolic\)/);

    // Expand Trust panel and verify wording + periodic domain restrictions (never decimal pi 3.14159)
    await trustBtn.click();
    const auditPanel = assistantMsg.locator('.pythos-audit-panel');
    await expect(auditPanel).toBeVisible();
    await expect(auditPanel.locator('.pythos-trust-checks')).toContainText(/nπ/);
    await expect(auditPanel).not.toContainText('3.1415926536');

    const stepDetails = auditPanel.locator('.pythos-audit-steps-details summary');
    if (await stepDetails.count() > 0) {
      await stepDetails.click();
      await expect(auditPanel.locator('.pythos-audit-step').first()).toBeVisible();
    }

    // Contextual tool handoffs: Show Domain Restrictions, Graph this, Check my Work
    const domainBtn = assistantMsg.locator('.pythos-handoff-btn[data-handoff-id="domain_restrictions"]');
    await expect(domainBtn).toBeVisible();
    await domainBtn.click();
    const domainPanel = assistantMsg.locator('.pythos-domain-restrictions-panel');
    await expect(domainPanel).toBeVisible();
    await expect(domainPanel).toContainText(/nπ/);
    await expect(domainPanel).not.toContainText('3.14159');

    // Graph this opens #floatGraphWindow with populated expression & painted canvas
    const graphBtn = assistantMsg.locator('.pythos-handoff-btn[data-handoff-id="graph"]');
    await expect(graphBtn).toBeVisible();
    await graphBtn.click();
    const graphWin = page.locator('#floatGraphWindow');
    await expect(graphWin).toBeVisible();
    await expect(page.locator('#graphFuncInput')).not.toHaveValue('');
    await page.locator('#graphCloseBtn').click();
    await expect(graphWin).toBeHidden();

    // Check my Work handoff opens with empty answer box, accepts exact fraction/expression & Enter key
    const checkHandoffBtn = assistantMsg.locator('.pythos-handoff-btn[data-handoff-id="check_work"]');
    await expect(checkHandoffBtn).toBeVisible();
    await checkHandoffBtn.click();
    const checkWin = page.locator('#floatCheckWindow');
    await expect(checkWin).toBeVisible();
    await expect(page.locator('#checkAnsInput')).toHaveValue('');

    // Verify fraction / expression support and Enter submit in Check Work
    await page.locator('#checkEqInput').fill('2*x - 3 = 0');
    await page.locator('#checkVarInput').fill('x');
    await page.locator('#checkAnsInput').fill('3/2');
    await page.locator('#checkAnsInput').press('Enter');
    await expect(page.locator('#checkResultArea')).toBeVisible();
    await expect(page.locator('#checkResultArea')).toContainText('✓ Correct!');

    // Wrong answer reveals Ask Pythos button
    await page.locator('#checkAnsInput').fill('5');
    await page.locator('#checkRunBtn').click();
    await expect(page.locator('#checkResultArea')).toContainText('✗ Incorrect.');
    await expect(page.locator('#checkAskPythosBtn')).toBeVisible();
    await page.locator('#checkCloseBtn').click();
    await expect(checkWin).toBeHidden();

    expect(pageErrors, `Page errors: ${pageErrors.join(' | ')}`).toEqual([]);
    expect(consoleErrors, `Console errors: ${consoleErrors.join(' | ')}`).toEqual([]);
  });

  test('pre-send formatting guard, malformed withholding card & suggested equation recovery', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto('/');
    await waitForMathLibs(page);

    const input = page.locator('#userInput');
    await input.fill('2sin²⁽ˣ⁾⁺csc(x)-9=0');
    await expect(page.locator('#mathPreview')).toBeVisible();
    await expect(page.locator('#mathPreviewGuard')).toBeVisible();
    await expect(page.locator('#mathPreviewFixBtn')).toBeVisible();

    // Verify Fix Formatting + reversible Undo Fix
    await page.locator('#mathPreviewFixBtn').click();
    await expect(page.locator('#mathPreviewUndoBtn')).toBeVisible();
    const fixedText = await input.inputValue();
    expect(fixedText).not.toContain('²⁽');

    await page.locator('#mathPreviewUndoBtn').click();
    const restoredText = await input.inputValue();
    expect(restoredText).toContain('2sin');

    // Submit intentionally malformed input -> server withholding + Solve/Edit actions
    const withheldMsg = await sendChatPrompt(page, '2sin²⁽ˣ⁾⁺csc(x)-9=0');
    await expect(withheldMsg.locator('.pythos-withholding-details')).toBeVisible();
    await expect(withheldMsg.locator('.pythos-suggested-fix-edit')).toBeVisible();
    await expect(withheldMsg.locator('.pythos-suggested-fix-solve')).toBeVisible();

    // Edit in Input loads without submitting
    await withheldMsg.locator('.pythos-suggested-fix-edit').click();
    await expect(page.locator('#userInput')).not.toHaveValue('2sin²⁽ˣ⁾⁺csc(x)-9=0');

    // Restore malformed message & test Solve Suggested Equation submits cleanly
    const nextSolved = await (async () => {
      await withheldMsg.locator('.pythos-suggested-fix-solve').click();
      await expect(page.locator('.message.assistant:not(.drafting)')).toHaveCount(2, { timeout: 25000 });
      return page.locator('.message.assistant:not(.drafting)').nth(1);
    })();
    await expect(nextSolved).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('floating tools (Calculator, Function Grapher, Matrix LaTeX, Units Converter) open, compute, and close cleanly', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto('/');
    await waitForMathLibs(page);

    // 1. Scientific Calculator
    await page.locator('#toolCalcBtn').click();
    await expect(page.locator('#floatCalcWindow')).toBeVisible();
    await page.locator('#calcDisplay').fill('2^3 + 4');
    await page.locator('#calcDisplay').press('Enter');
    await expect(page.locator('#calcDisplay')).toHaveValue('12');
    await page.locator('#calcCloseBtn').click();
    await expect(page.locator('#floatCalcWindow')).toBeHidden();

    // 2. Toolbox popover -> Function Grapher
    await page.locator('#toolboxMenuBtn').click();
    await expect(page.locator('#toolboxPopoverMenu')).toBeVisible();
    await page.locator('#toolGraphBtn').click();
    await expect(page.locator('#floatGraphWindow')).toBeVisible();
    await page.locator('#graphFuncInput').fill('x^2 - 4');
    await page.locator('#graphPlotBtn').click();
    const graphHasPixels = await page.evaluate(() => {
      const c = document.getElementById('graphCanvas');
      const ctx = c.getContext('2d');
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      return d.some(v => v !== 0);
    });
    expect(graphHasPixels).toBe(true);
    await page.locator('#graphCloseBtn').click();

    // 3. Toolbox -> Matrix Calculator with LaTeX input
    await page.locator('#toolboxMenuBtn').click();
    await page.locator('#toolMatrixBtn').click();
    await expect(page.locator('#floatMatrixWindow')).toBeVisible();
    await page.locator('#matrixAInput').fill('\\begin{bmatrix} 1 & 2 \\\\ 3 & 4 \\end{bmatrix}');
    await page.locator('#matDetBtn').click();
    await expect(page.locator('#matrixResultArea')).toBeVisible();
    await expect(page.locator('#matrixResultArea')).toContainText('-2');
    await page.locator('#matrixCloseBtn').click();

    // 4. Toolbox -> Unit Converter
    await page.locator('#toolboxMenuBtn').click();
    await page.locator('#toolUnitsBtn').click();
    await expect(page.locator('#floatUnitsWindow')).toBeVisible();
    await page.locator('#unitsValueInput').fill('100 kph');
    await page.locator('#unitsTargetInput').fill('mph');
    await page.locator('#unitsConvertBtn').click();
    await expect(page.locator('#unitsResultArea')).toBeVisible();
    await expect(page.locator('#unitsResultArea')).toContainText(/62\.13/);
    await page.locator('#unitsCloseBtn').click();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });

  test('Tutor Mode progression, request cancellation & sidebar navigation interactions', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto('/');
    await waitForMathLibs(page);

    // Tutor Mode activation & hint progression
    await page.locator('#tutorModeToggleBtn').click();
    await expect(page.locator('#tutorModeBanner')).toBeVisible();

    const hint1 = await sendChatPrompt(page, 'Solve x^2 - 5x + 6 = 0');
    await expect(hint1.locator('.pythos-tutor-actions')).toBeVisible();
    await expect(hint1).toContainText(/Step 1 hint/i);

    await hint1.locator('.pythos-tutor-btn', { hasText: 'Next Hint' }).click();
    await expect(page.locator('.message.assistant:not(.drafting)')).toHaveCount(2, { timeout: 25000 });
    const hint2 = page.locator('.message.assistant:not(.drafting)').nth(1);
    await expect(hint2).toContainText(/Step 2 hint/i);

    await page.locator('#tutorModeExitBtn').click();
    await expect(page.locator('#tutorModeBanner')).toBeHidden();

    // Slow request cancellation via Stop button
    await page.locator('#userInput').fill('Slow integral to cancel: int x^5 dx');
    await page.locator('#submitBtn').click();
    await expect(page.locator('#submitBtn.stop-mode')).toBeVisible({ timeout: 8000 });
    await page.locator('#submitBtn.stop-mode').click();
    await expect(page.locator('#submitBtn:not(.stop-mode)')).toBeVisible({ timeout: 8000 });

    // Following prompt succeeds normally after cancellation
    const postCancel = await sendChatPrompt(page, 'Solve 2x + 7 = 19', {
      expectedAssistantCount: (await page.locator('.message.assistant:not(.drafting)').count()) + 1
    });
    await expect(postCancel).toContainText(/6/);

    // Sidebar New Chat & LANZAR ID modal keyboard dismissal
    await page.locator('#lanzarIdLoginBtn').click();
    await expect(page.locator('#lanzarIdModal')).toBeVisible();
    await page.locator('#lanzarIdModalCloseBtn').click();
    await expect(page.locator('#lanzarIdModal')).toBeHidden();

    await page.locator('#newChatBtn').click();
    await expect(page.locator('#welcomeOracleCard')).toBeVisible();

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
