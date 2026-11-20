const { test, expect } = require('@playwright/test');
const { attachErrorCollectors, waitForMathLibs, assertNoViewportOverflow } = require('./helpers/browserAssertions');

const LIVE_URL = process.env.PYTHOS_LIVE_URL || 'https://pythos.lanzar.me';

test.describe('Pythos Deployed Production Live Smoke', () => {
  test('live workspace loads cleanly and interactive tools function in desktop & mobile', async ({ page }) => {
    const { pageErrors, consoleErrors } = attachErrorCollectors(page);
    await page.goto(LIVE_URL, { waitUntil: 'domcontentloaded' });
    await waitForMathLibs(page);

    await expect(page.locator('header h1')).toContainText('PYTHOS');
    await expect(page.locator('#welcomeOracleCard')).toBeVisible();
    await assertNoViewportOverflow(page, 'live desktop');

    // Interactive Calc
    await page.locator('#toolCalcBtn').click();
    await expect(page.locator('#floatCalcWindow')).toBeVisible();
    await page.locator('#calcDisplay').fill('5^2');
    await page.locator('#calcDisplay').press('Enter');
    await expect(page.locator('#calcDisplay')).toHaveValue('25');
    await page.locator('#calcCloseBtn').click();

    // Interactive Check Work fractional expression
    await page.locator('#toolCheckBtn').click();
    await page.locator('#checkEqInput').fill('2*x = 3');
    await page.locator('#checkAnsInput').fill('3/2');
    await page.locator('#checkAnsInput').press('Enter');
    await expect(page.locator('#checkResultArea')).toContainText('✓ Correct!');
    await page.locator('#checkCloseBtn').click();

    // Live health API check via page fetch
    const apiHealth = await page.evaluate(async () => {
      const r = await fetch('https://pythos-api.lanzar.me/health');
      return { status: r.status, json: await r.json() };
    });
    expect(apiHealth.status).toBe(200);
    expect(apiHealth.json.status).toBe('ok');

    // Mobile portrait check
    await page.setViewportSize({ width: 390, height: 844 });
    await assertNoViewportOverflow(page, 'live mobile portrait');

    expect(pageErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
  });
});
