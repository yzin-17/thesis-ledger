const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.CHART_INFO_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.CHART_INFO_QA_OUTPUT || '/tmp/chart-info-tips-qa';
mkdirSync(output, { recursive: true });
const stockText = '成交与成本参考需使用同币种的不复权行情；当前仍可测量价格区间。';
const fundText = '请从具体账户的基金持仓打开详情，才能查看成本参考。';
async function keyboardFocus(page, trigger) {
  await trigger.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
}
async function popup(page, text) {
  const content = page.locator('[data-slot="hover-card-content"]');
  await content.getByText(text, { exact: true }).waitFor();
  const box = await content.boundingBox();
  const viewport = page.viewportSize();
  assert(box.x >= -1 && box.x + box.width <= viewport.width + 1);
  assert(box.y >= -1 && box.y + box.height <= viewport.height + 1);
  return content;
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_INFO_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', hasTouch: width === 390 });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => { reads.push(route.request().url()); return route.abort(); });
      await page.goto(`${origin}/test/browser-market-number-readouts.html?case=ordinary`);
      const stock = page.locator('[data-qa-stock]');
      await stock.getByText('交易参考与测量', { exact: true }).click();
      const info = stock.getByRole('button', { name: '成交与成本参考说明', exact: true });
      await info.waitFor();
      assert.equal(await page.getByText(stockText, { exact: true }).count(), 0);
      assert.equal(await info.getAttribute('aria-description'), stockText);
      await info.hover();
      let content = await popup(page, stockText);
      await stock.screenshot({ path: `${output}/stock-${width}.png`, animations: 'disabled' });
      await stock.getByRole('button', { name: 'K线', exact: true }).click();
      await content.waitFor({ state: 'hidden' });
      await keyboardFocus(page, info);
      content = await popup(page, stockText);
      await page.keyboard.press('Escape');
      await content.waitFor({ state: 'hidden' });
      if (width === 390) await info.tap();
      else await info.click();
      content = await popup(page, stockText);
      await stock.getByRole('button', { name: 'K线', exact: true }).click();
      await content.waitFor({ state: 'hidden' });
      const measure = stock.getByRole('button', { name: '区间测量', exact: true });
      await measure.click();
      await stock.getByText('请选择区间起点，再选择终点。', { exact: true }).waitFor();
      await keyboardFocus(page, info);
      content = await popup(page, stockText);
      await page.keyboard.press('Escape');
      await content.waitFor({ state: 'hidden' });
      assert.equal(await measure.getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await measure.getAttribute('aria-pressed'), 'false');
      await stock.getByRole('button', { name: '全屏', exact: true }).click();
      const fullscreen = page.getByRole('dialog').last();
      await fullscreen.getByText('交易参考与测量', { exact: true }).click();
      await keyboardFocus(page, fullscreen.getByRole('button', { name: '成交与成本参考说明', exact: true }));
      content = await popup(page, stockText);
      await page.keyboard.press('Escape');
      await content.waitFor({ state: 'hidden' });
      assert(await fullscreen.isVisible());
      await page.keyboard.press('Escape');
      await fullscreen.waitFor({ state: 'hidden' });
      await page.goto(`${origin}/test/browser-chart-date-ranges.html`);
      const fund = page.getByRole('region', { name: '基金区间验证', exact: true });
      await fund.getByText('参考与测量', { exact: true }).click();
      const costInfo = fund.getByRole('button', { name: '成本参考说明', exact: true });
      assert.equal(await page.getByText(fundText, { exact: true }).count(), 0);
      await keyboardFocus(page, costInfo);
      content = await popup(page, fundText);
      await fund.screenshot({ path: `${output}/fund-${width}.png`, animations: 'disabled' });
      await page.keyboard.press('Escape');
      await content.waitFor({ state: 'hidden' });
      const fundMeasure = fund.getByRole('button', { name: '区间测量', exact: true });
      await fundMeasure.click();
      await fund.getByText('请选择净值区间起点，再选择终点。', { exact: true }).waitFor();
      await keyboardFocus(page, costInfo);
      content = await popup(page, fundText);
      await page.keyboard.press('Escape');
      await content.waitFor({ state: 'hidden' });
      assert.equal(await fundMeasure.getAttribute('aria-pressed'), 'true');
      await page.keyboard.press('Escape');
      assert.equal(await fundMeasure.getAttribute('aria-pressed'), 'false');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      assert.deepEqual(reads, []);
      results.push({ width, hover: true, focus: true, click: true, touch: width === 390, escapePriority: true, fund: true, inlineTextRemoved: true, overflow: false });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
