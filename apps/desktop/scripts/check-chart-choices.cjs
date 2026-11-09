const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.CHART_CHOICES_QA_OUTPUT || '/tmp/chart-choices-qa';
const origin = process.env.CHART_CHOICES_QA_BASE_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_CHOICES_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => { reads.push(route.request().url()); return route.abort(); });
      await page.goto(`${origin}/test/browser-chart-choices.html`);
      const stock = page.getByRole('region', { name: '行情选项验证', exact: true });
      const fund = page.getByRole('region', { name: '基金选项验证', exact: true });
      const periods = stock.locator('[data-market-chart-toolbar-group="周期"]');
      await stock.getByRole('combobox', { name: '更多周期', exact: true }).waitFor();
      assert.deepEqual(await periods.locator('button').evaluateAll((buttons) => buttons.map((button) => button.querySelector('[data-slot="select-value"]')?.textContent ?? button.textContent)), ['1 分钟', '日线', '周线', '更多']);
      await stock.getByRole('combobox', { name: '更多周期', exact: true }).click();
      await page.getByRole('option').first().waitFor();
      assert.deepEqual(await page.getByRole('option').allTextContents(), ['5 分钟', '15 分钟', '30 分钟', '60 分钟', '5 日线', '月线', '年线']);
      await page.getByRole('option', { name: '5 分钟', exact: true }).click();
      assert.equal(await stock.getByRole('combobox', { name: '更多周期', exact: true }).innerText(), '5 分钟');
      assert.equal(await periods.getByRole('button', { name: '5 分钟', exact: true }).count(), 0);
      await stock.getByRole('button', { name: '切换股票与 ETF', exact: true }).click();
      assert.equal(await stock.getByRole('combobox', { name: '更多周期', exact: true }).innerText(), '5 分钟');
      await periods.getByRole('button', { name: '日线', exact: true }).click();
      assert.equal(await stock.getByRole('combobox', { name: '更多周期', exact: true }).innerText(), '更多');
      for (const section of [stock, fund]) {
        const range = section.locator('[data-market-chart-toolbar-group="区间"]');
        assert.deepEqual(await range.locator('button').evaluateAll((buttons) => buttons.map((button) => button.querySelector('[data-slot="select-value"]')?.textContent ?? button.textContent)), ['今日', '一月', '一年', '更多']);
        await section.getByRole('combobox', { name: '更多区间', exact: true }).click();
        await page.getByRole('option').first().waitFor();
      assert.deepEqual(await page.getByRole('option').allTextContents(), ['一周', '半年', '三年', '自定义区间']);
        await page.getByRole('option', { name: '半年', exact: true }).click();
        assert.equal(await section.getByRole('combobox', { name: '更多区间', exact: true }).innerText(), '半年');
        await section.getByRole('combobox', { name: '更多区间', exact: true }).click();
        await page.getByRole('option').first().waitFor();
        await page.keyboard.press('Escape');
        await page.getByRole('option').first().waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('option').count(), 0);
        assert.equal(await section.getByRole('combobox', { name: '更多区间', exact: true }).getAttribute('aria-expanded'), 'false');
        await section.getByRole('button', { name: '一月', exact: true }).click();
        assert.equal(await section.getByRole('combobox', { name: '更多区间', exact: true }).innerText(), '更多');
        await section.getByRole('combobox', { name: '更多区间', exact: true }).click();
        await page.getByRole('option', { name: '自定义区间', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '自定义区间', exact: true });
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await section.getByRole('button', { name: '一月', exact: true }).getAttribute('aria-pressed'), 'true');
      }
      await page.screenshot({ path: `${output}/choices-${width}.png`, fullPage: true, animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      assert.deepEqual(reads, []);
      results.push({ width, quickPeriods: 3, quickRanges: 3, more: true, chineseSelection: true, cancel: true, noReads: true, overflow: false });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
