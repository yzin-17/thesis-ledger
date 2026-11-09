const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.TOAST_APPEARANCE_QA_OUTPUT || '/tmp/toast-appearance-qa';
const origin = process.env.TOAST_APPEARANCE_QA_BASE_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.TOAST_APPEARANCE_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = []; page.on('pageerror', (error) => errors.push(error.message));
      await page.goto(`${origin}/test/browser-toast-appearance.html`);
      await page.getByRole('button', { name: '显示消息', exact: true }).click();
      const toasts = page.locator('[data-slot="toast"]').filter({ hasText: '消息外观验证' });
      await toasts.last().waitFor();
      const appearances = await toasts.evaluateAll((nodes) => nodes.map((node) => ({
        shadow: getComputedStyle(node).boxShadow,
        radius: parseFloat(getComputedStyle(node).borderTopLeftRadius),
        border: parseFloat(getComputedStyle(node).borderTopWidth),
        viewportRadius: parseFloat(getComputedStyle(node.closest('[data-slot="toast-viewport"]')).borderTopLeftRadius),
        box: node.getBoundingClientRect().toJSON(),
      })));
      assert.equal(appearances.length, 5);
      for (const appearance of appearances) {
        const colors = appearance.shadow.match(/rgba?\([^)]+\)/g) ?? [];
        assert(appearance.shadow === 'none' || colors.length > 0 && colors.every((color) => /^rgba\([^)]*,\s*0\)$/.test(color)), appearance.shadow);
        assert(appearance.radius > 0 && appearance.border > 0); assert.equal(appearance.viewportRadius, 0);
        assert(appearance.box.x >= 0 && appearance.box.right <= width);
      }
      await page.screenshot({ path: `${output}/messages-${width}.png`, animations: 'disabled' });
      for (let count = 5; count > 0; count--) {
        await toasts.first().locator('[data-slot="toast-close"]').click();
        await page.waitForFunction((expected) => [...document.querySelectorAll('[data-slot="toast"]')].filter((node) => node.textContent.includes('消息外观验证')).length === expected, count - 1);
      }
      assert.deepEqual(errors, []);
      results.push({ width, types: 5, noShadow: true, corners: true, borders: true, manualClose: true });
      console.log(JSON.stringify(results.at(-1))); await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
