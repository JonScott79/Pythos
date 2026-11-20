const { expect } = require('@playwright/test');

function attachErrorCollectors(page, { allowAbortErrors = true } = {}) {
  const pageErrors = [];
  const consoleErrors = [];

  page.on('pageerror', (err) => {
    pageErrors.push(err.message || String(err));
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text() || '';
      if (allowAbortErrors && /aborted|AbortError|BodyStreamBuffer/i.test(txt)) return;
      consoleErrors.push(txt);
    }
  });

  return { pageErrors, consoleErrors };
}

async function waitForMathLibs(page) {
  await page.waitForFunction(() => Boolean(window.math && window.katex && window.renderMathInElement), {
    timeout: 15000
  });
}

async function sendChatPrompt(page, text, { expectedAssistantCount } = {}) {
  const input = page.locator('#userInput');
  const sendBtn = page.locator('#submitBtn');
  const beforeCount = await page.locator('.message.assistant:not(.drafting)').count();
  const targetCount = typeof expectedAssistantCount === 'number' ? expectedAssistantCount : beforeCount + 1;

  await input.fill(text);
  await expect(sendBtn).toBeEnabled();
  await sendBtn.click();

  await expect(page.locator('.message.assistant:not(.drafting)')).toHaveCount(targetCount, { timeout: 25000 });
  return page.locator('.message.assistant:not(.drafting)').nth(targetCount - 1);
}

async function assertNoViewportOverflow(page, label = 'viewport') {
  const metrics = await page.evaluate(() => ({
    docScrollWidth: document.documentElement.scrollWidth,
    docClientWidth: document.documentElement.clientWidth,
    bodyScrollWidth: document.body.scrollWidth,
    bodyClientWidth: document.body.clientWidth
  }));
  expect(
    metrics.docScrollWidth,
    `${label}: documentElement.scrollWidth (${metrics.docScrollWidth}) exceeded clientWidth (${metrics.docClientWidth})`
  ).toBeLessThanOrEqual(metrics.docClientWidth + 2);
}

module.exports = {
  attachErrorCollectors,
  waitForMathLibs,
  sendChatPrompt,
  assertNoViewportOverflow
};
