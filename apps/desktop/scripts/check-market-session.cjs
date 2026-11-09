const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.MARKET_SESSION_QA_OUTPUT || '/tmp/unified-market-session-qa';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/api/v1/**', route => route.abort());
      await page.goto(`${process.env.MARKET_SESSION_QA_URL || 'http://localhost:5173'}/test/browser-market-session.html`);
      const fund = page.locator('[data-fund-current-valuation]');
      await fund.getByText(/已休市/).waitFor();
      assert((await fund.textContent()).includes('1.0250'));
      assert.equal(await page.locator('svg line title').textContent(), '交易时段间隔');
      await page.screenshot({ path: `${output}/closed-${width}.png` });
      await page.getByRole('button', { name: '切换未知' }).click();
      await fund.getByText('交易时段未知').waitFor();
      assert(!(await fund.textContent()).includes('已休市'));
      assert(!(await fund.textContent()).includes('1.0250'));
      await fund.getByRole('button', { name: '重试估值' }).waitFor();
      assert.equal(await page.locator('svg line title').count(), 0);
      await page.screenshot({ path: `${output}/unknown-${width}.png` });
      await page.getByRole('button', { name: '切换休市' }).click();
      await fund.getByText(/已休市/).waitFor();
      await page.getByRole('button', { name: '证券行情', exact: true }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByText('休市快照', { exact: true }).waitFor();
      const box = await dialog.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({ path: `${output}/security-${width}.png` });
      await page.keyboard.press('Escape');
      await dialog.waitFor({ state: 'hidden' });
      assert.deepEqual(errors, []);
      results.push({ width, closedSnapshot: true, unknownNotClosed: true, factDrivenGap: true, noOverflow: true, dialogCloses: true });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
