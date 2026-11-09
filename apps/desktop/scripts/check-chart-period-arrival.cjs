const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.CHART_PERIOD_ARRIVAL_QA_OUTPUT || '/tmp/chart-period-arrival-qa';
const origin = process.env.CHART_PERIOD_ARRIVAL_QA_BASE_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_PERIOD_ARRIVAL_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => { reads.push(route.request().url()); return route.abort(); });
      await page.goto(`${origin}/test/browser-chart-choices.html?staged=1`);
      const section = page.getByRole('region', { name: '行情选项验证', exact: true });
      const toolbar = section.locator('[data-market-chart-toolbar]');
      const period = toolbar.locator('[data-market-chart-toolbar-group="周期"]');
      await period.getByRole('button', { name: '1 分钟', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      assert.equal(await period.getByRole('button', { name: '周线', exact: true }).count(), 0);
      const initial = await period.locator('[data-slot="toggle-group"]').boundingBox();
      assert(initial.width < 240);
      await section.getByRole('button', { name: '补齐周线能力', exact: true }).click();
      await period.getByRole('button', { name: '周线', exact: true }).waitFor();
      assert.equal(await period.getByRole('button', { name: '5 分钟', exact: true }).count(), 0);
      const complete = await period.locator('[data-slot="toggle-group"]').boundingBox();
      assert(complete.width > initial.width && complete.width < 240);
      await page.screenshot({ path: `${output}/ready-${width}.png`, fullPage: true, animations: 'disabled' });
      await section.getByRole('button', { name: '仅保留日线能力', exact: true }).click();
      await period.getByRole('button', { name: '周线', exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await period.getByRole('combobox', { name: '更多周期', exact: true }).count(), 0);
      const daily = await period.locator('[data-slot="toggle-group"]').boundingBox();
      assert(daily.width < initial.width);
      assert.equal(await period.getByRole('button', { name: '1 分钟', exact: true }).count(), 0);
      await page.screenshot({ path: `${output}/partial-${width}.png`, fullPage: true, animations: 'disabled' });
      await section.getByRole('button', { name: '补齐周线能力', exact: true }).click();
      await period.getByRole('button', { name: '周线', exact: true }).waitFor();
      assert.equal(await period.getByRole('button', { name: '5 分钟', exact: true }).count(), 0);
      assert(await period.getByRole('combobox', { name: '更多周期', exact: true }).isEnabled());
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      assert.deepEqual(reads, []);
      results.push({ width, weekAvailable: true, contentWidth: true, fiveMinuteCollapsed: true, unavailableHidden: true, overflow: false });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
