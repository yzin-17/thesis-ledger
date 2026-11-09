const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.CHART_RANGE_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.CHART_RANGE_QA_OUTPUT || '/tmp/chart-date-ranges-qa';
mkdirSync(output, { recursive: true });
const options = ['一周', '半年', '三年', '自定义区间'];
const common = ['今日', '一月', '一年'];

async function choose(page, scope, label) {
  if (common.includes(label)) {
    await scope.getByRole('button', { name: label, exact: true }).click();
    return;
  }
  await scope.getByRole('combobox', { name: '更多区间', exact: true }).click();
  await page.getByRole('option').first().waitFor();
  assert.deepEqual(await page.getByRole('option').allTextContents(), options);
  await page.getByRole('option', { name: label, exact: true }).click();
}

async function custom(page, scope) {
  const select = scope.getByRole('combobox', { name: '更多区间', exact: true });
  const before = await select.innerText();
  await choose(page, scope, '自定义区间');
  const dialog = page.getByRole('dialog', { name: '自定义区间', exact: true });
  await dialog.getByRole('button', { name: '打开开始日期', exact: true }).click();
  const calendar = page.locator('[data-slot="popover-content"]');
  await calendar.waitFor();
  const calendarBox = await calendar.boundingBox();
  assert(calendarBox.x >= 0 && calendarBox.x + calendarBox.width <= page.viewportSize().width + 1);
  await page.keyboard.press('Escape');
  await calendar.waitFor({ state: 'hidden' });
  assert(await dialog.isVisible());
  await dialog.getByLabel('开始日期', { exact: true }).fill('2026-11-07');
  await dialog.getByLabel('结束日期', { exact: true }).fill('2026-11-06');
  await dialog.getByRole('button', { name: '应用区间', exact: true }).click();
  assert(await dialog.getByRole('alert').isVisible());
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await select.innerText(), before);
  await choose(page, scope, '自定义区间');
  await dialog.getByLabel('开始日期', { exact: true }).fill('2025-02-01');
  await dialog.getByLabel('结束日期', { exact: true }).fill('2099-02-12');
  await dialog.getByRole('button', { name: '应用区间', exact: true }).click();
  assert((await dialog.getByRole('alert').innerText()).includes('不能晚于今天'));
  await dialog.getByLabel('结束日期', { exact: true }).fill('2025-02-12');
  const box = await dialog.boundingBox();
  const width = page.viewportSize().width;
  assert(box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 1001);
  await page.screenshot({ path: `${output}/custom-${width}.png`, animations: 'disabled' });
  await dialog.getByRole('button', { name: '应用区间', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(await select.innerText(), '自定义区间');
}

(async () => {
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.CHART_RANGE_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of (process.env.CHART_RANGE_QA_WIDTHS || '1440,1024,768,390').split(',').map(Number)) {
      const context = await browser.newContext({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      page.setDefaultTimeout(10000);
      const errors = [], reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      let fail = false;
      await page.route('**/test/chart-range-history?*', (route) => {
        reads.push(new URL(route.request().url()).searchParams.get('start'));
        return route.fulfill({ json: {} });
      });
      await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        assert.equal(route.request().method(), 'GET');
        const url = new URL(route.request().url());
        if (url.pathname.endsWith('/fund-nav/history')) {
          reads.push(url.searchParams.get('start'));
          assert.equal(url.searchParams.get('limit'), '3650');
          if (fail) return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
          const history = await page.evaluate(() => window.chartRangeFixtureHistory);
          return route.fulfill({ json: history.filter((point) =>
            url.searchParams.get('start') <= point.navDate.slice(0, 10) &&
            point.navDate.slice(0, 10) <= url.searchParams.get('end')) });
        }
        if (url.pathname.endsWith('/fund-valuation/today')) return route.fulfill({ json: {
          version: 1, symbol: '000001.OF', date: '2026-11-08', timezone: 'Asia/Shanghai',
          asOf: '2026-11-08T00:00:00Z', points: [],
        } });
        throw new Error(`未声明的受控请求：${url.pathname}`);
      });
      await page.goto(`${origin}/test/browser-chart-date-ranges.html`);
      const stock = page.getByRole('region', { name: '股票区间验证' });
      const fund = page.getByRole('region', { name: '基金区间验证' });
      assert.equal(await stock.getByRole('button', { name: '一月', exact: true }).getAttribute('aria-pressed'), 'true');
      assert.equal(await stock.getByRole('combobox').innerText(), '更多');
      assert.equal(await fund.getByRole('button', { name: '一月', exact: true }).getAttribute('aria-pressed'), 'true');
      await choose(page, stock, '三年');
      await stock.getByText(/2023\/11\/6\s*至\s*2026\/11\/6/).waitFor();
      assert(reads.includes('2023-11-06'));
      await choose(page, fund, '三年');
      await fund.getByRole('status', { name: '正在读取净值图数据', exact: true }).waitFor({ state: 'hidden' });
      assert(!(await fund.innerText()).includes('未完全覆盖'));
      const canvas = await fund.locator('canvas').first().elementHandle();
      for (const label of ['一周', '一月', '半年', '一年', '三年']) {
        await choose(page, stock, label);
        await choose(page, fund, label);
      }
      await custom(page, stock);
      await stock.getByText(/2025\/2\/1\s*至\s*2025\/2\/12/).waitFor();
      await custom(page, fund);
      assert(await canvas.evaluate((element) => element.isConnected));
      await fund.getByRole('status', { name: '正在读取净值图数据', exact: true }).waitFor({ state: 'hidden' });
      if (width === 1440) {
        await fund.getByRole('button', { name: '编辑日期', exact: true }).click();
        const dialog = page.getByRole('dialog', { name: '自定义区间', exact: true });
        await dialog.getByLabel('开始日期', { exact: true }).fill('1990-01-01');
        await dialog.getByLabel('结束日期', { exact: true }).fill('1990-01-06');
        await dialog.getByRole('button', { name: '应用区间', exact: true }).click();
        await fund.getByText('所选区间暂无净值数据。', { exact: true }).waitFor();
        assert.equal(await fund.getByText('所选区间暂无净值数据。', { exact: true }).count(), 1);
        fail = true;
        await fund.getByRole('button', { name: '编辑日期', exact: true }).click();
        await dialog.getByLabel('开始日期', { exact: true }).fill('2010-01-01');
        await dialog.getByLabel('结束日期', { exact: true }).fill('2010-01-06');
        await dialog.getByRole('button', { name: '应用区间', exact: true }).click();
        await fund.getByRole('button', { name: '重试区间', exact: true }).waitFor();
        assert(await canvas.evaluate((element) => element.isConnected));
        fail = false;
        await fund.getByRole('button', { name: '重试区间', exact: true }).click();
        await fund.getByRole('button', { name: '重试区间', exact: true }).waitFor({ state: 'hidden' });
        await choose(page, fund, '三年');
      }
      await choose(page, fund, '今日');
      await fund.locator('[data-fund-intraday-chart]').waitFor();
      await choose(page, fund, '一周');
      await choose(page, stock, '今日');
      assert.equal(await stock.getByRole('button', { name: '今日', exact: true }).getAttribute('aria-pressed'), 'true');
      await choose(page, stock, '一月');
      await stock.getByRole('button', { name: '全屏', exact: true }).click();
      const fullscreen = page.getByRole('dialog').last();
      await choose(page, fullscreen, '自定义区间');
      await page.getByRole('dialog', { name: '自定义区间', exact: true }).getByLabel('开始日期', { exact: true }).focus();
      await page.keyboard.press('Escape');
      await page.getByRole('dialog', { name: '自定义区间', exact: true }).waitFor({ state: 'hidden' });
      assert(await fullscreen.getByRole('button', { name: '退出全屏', exact: true }).isVisible());
      await page.keyboard.press('Escape');
      await stock.getByRole('button', { name: '全屏', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/charts-${width}.png`, fullPage: true, animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      results.push({ width, presets: 7, custom: true, invalidDates: true, cancel: true,
        futureRejected: true, longHistory: true, sameCanvas: true, today: true, fullscreen: true, overflow: false, reads: reads.length });
      console.log(JSON.stringify(results.at(-1)));
      await context.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
