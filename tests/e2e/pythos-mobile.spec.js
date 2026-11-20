const { test, expect } = require('@playwright/test');
const {
  attachErrorCollectors,
  waitForMathLibs,
  sendChatPrompt,
  assertNoViewportOverflow
} = require('./helpers/browserAssertions');

test.describe('Pythos Mobile Portrait & Landscape UX', () => {
  test('primary toolbar wraps cleanly, floating tools stay inside viewport & equations do not break layout', async ({ page }, testInfo) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto('/');
    await waitForMathLibs(page);

    const vp = page.viewportSize();
    await assertNoViewportOverflow(page, `${testInfo.project.name} initial`);

    // 1. Primary toolbar buttons & Tutor Mode must sit fully inside horizontal viewport bounds
    const toolbarBounds = await page.evaluate(() => {
      const ids = ['toolCheckBtn', 'toolCalcBtn', 'toolSimLabBtn', 'toolboxMenuBtn', 'tutorModeToggleBtn'];
      const vw = document.documentElement.clientWidth;
      return ids.map(id => {
        const el = document.getElementById(id);
        const r = el.getBoundingClientRect();
        return { id, left: r.left, right: r.right, width: r.width, vw };
      });
    });
    for (const b of toolbarBounds) {
      expect(b.width, `${b.id} must have visible width`).toBeGreaterThan(20);
      expect(b.left, `${b.id} clipped left`).toBeGreaterThanOrEqual(-1);
      expect(b.right, `${b.id} (${b.right}px) clipped right edge of ${b.vw}px viewport`).toBeLessThanOrEqual(b.vw + 2);
    }

    // 2. Sidebar navigation: drawer opens & closes via tap on narrow portrait; docked sidebar visible on wide landscape
    const mobileMenuBtn = page.locator('#mobileMenuBtn');
    if (vp.width <= 768) {
      await expect(mobileMenuBtn).toBeVisible();
      await mobileMenuBtn.tap();
      await expect(page.locator('#sidebar')).toHaveClass(/open/);
      await page.locator('#sidebarCloseBtn').tap();
      await expect(page.locator('#sidebar')).not.toHaveClass(/open/);
    } else {
      await expect(page.locator('#sidebar')).toBeVisible();
    }

    // 3. Send equation -> KaTeX + single Trust badge + expanded audit panel stay within mobile width
    const assistantMsg = await sendChatPrompt(page, 'Verify csc(x) = 1/sin(x)');
    await expect(assistantMsg.locator('.katex').first()).toBeVisible();

    const trustBtn = assistantMsg.locator('.msg-audit-btn');
    await expect(trustBtn).toBeVisible();
    await trustBtn.tap();
    const auditPanel = assistantMsg.locator('.pythos-audit-panel');
    await expect(auditPanel).toBeVisible();
    await expect(auditPanel).toContainText(/nπ/);

    const panelBox = await auditPanel.boundingBox();
    expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(vp.width + 2);
    await assertNoViewportOverflow(page, `${testInfo.project.name} after verified reply`);

    // 4. Open Check Work floating tool on mobile -> fits cleanly within viewport & verifies on tap
    await page.locator('#toolCheckBtn').tap();
    const checkWin = page.locator('#floatCheckWindow');
    await expect(checkWin).toBeVisible();
    const winBox = await checkWin.boundingBox();
    expect(winBox.x).toBeGreaterThanOrEqual(0);
    expect(winBox.x + winBox.width).toBeLessThanOrEqual(vp.width + 2);
    expect(winBox.y + winBox.height).toBeLessThanOrEqual(vp.height + 2);

    await page.locator('#checkAnsInput').fill('6');
    await page.locator('#checkRunBtn').tap();
    await expect(page.locator('#checkResultArea')).toContainText('✓ Correct!');
    await page.locator('#checkCloseBtn').tap();
    await expect(checkWin).toBeHidden();

    // 5. Long display equation stays scrollable/contained without widening document
    await page.evaluate(() => {
      const container = document.querySelector('#output .message.assistant .message-content');
      if (container && window.katex) {
        const div = document.createElement('div');
        div.innerHTML = window.katex.renderToString(
          'x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a} + \\sum_{k=1}^{10} \\frac{a_k x^k}{k! + 1}',
          { displayMode: true }
        );
        container.appendChild(div);
      }
    });
    await assertNoViewportOverflow(page, `${testInfo.project.name} wide display equation`);

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
