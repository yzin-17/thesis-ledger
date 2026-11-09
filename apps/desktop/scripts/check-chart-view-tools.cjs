const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.CHART_TOOLS_QA_BASE_URL || 'http://localhost:5173';
const output = process.env.CHART_TOOLS_QA_OUTPUT || '/tmp/chart-view-tools-qa';
mkdirSync(output, { recursive: true });
const tools = ['回到最新', '重置', '全屏', '放大图表', '缩小图表', '查看更早日期', '查看更晚日期'];
const range = (root) => root.evaluate(async (node) => {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const entry = [...window.chartToolsNative].reverse().find((item) => item.host.isConnected && node.contains(item.host));
  return entry.chart.timeScale().getVisibleLogicalRange();
});
const sameRange = (a, b) => { assert(Math.abs(a.from - b.from) < .001, `${JSON.stringify(a)} != ${JSON.stringify(b)}`); assert(Math.abs(a.to - b.to) < .001); };
const buttons = (root) => root.locator('[data-market-chart-toolbar-group="视图"] button').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') || node.textContent));
async function clickPoint(page, root, logical) {
  const position = await root.evaluate((node, logical) => {
    const entry = [...window.chartToolsNative].reverse().find((item) => item.host.isConnected && node.contains(item.host));
    const box = entry.host.getBoundingClientRect();
    return { x: box.x + entry.chart.priceScale('left').width() + entry.chart.timeScale().logicalToCoordinate(logical), y: box.y + 80 };
  }, logical);
  await page.mouse.click(position.x, position.y);
}
async function tradePixel(root) {
  return root.evaluate((node) => {
    const probe = document.createElement('span'); probe.style.color = 'var(--color-market-up)'; node.append(probe);
    const rgb = getComputedStyle(probe).color.match(/\d+/g).map(Number); probe.remove();
    for (const canvas of node.querySelectorAll('canvas')) {
      if (!canvas.width || !canvas.height) continue;
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      for (let y = canvas.height - 1; y >= 0; y--) for (let x = 0; x < canvas.width; x++) {
        const index = (y * canvas.width + x) * 4;
        if (pixels[index] === rgb[0] && pixels[index + 1] === rgb[1] && pixels[index + 2] === rgb[2] && pixels[index + 3] > 200) {
          const box = canvas.getBoundingClientRect(); return { x: box.x + (x + .5) * box.width / canvas.width, y: box.y + (y + .5) * box.height / canvas.height };
        }
      }
    }
    return null;
  });
}
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_TOOLS_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const reads = [], errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.addInitScript(() => { window.chartToolsNative = []; window.chartToolsMarkers = []; window.chartToolsLabels = [];
        const text = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function(value, ...args) { if (String(value).includes('验证模型')) window.chartToolsLabels.push(value); return text.call(this, value, ...args); };
      });
      await page.route('**/node_modules/.vite/deps/lightweight-charts.js*', (route) => {
        const url = new URL(route.request().url());
        if (url.searchParams.has('nativeChartTools')) return route.continue();
        url.searchParams.set('nativeChartTools', '1'); const source = JSON.stringify(url.href);
        return route.fulfill({ contentType: 'text/javascript', body: `import * as native from ${source}; export * from ${source};
          export const createChart = (...args) => { const chart = native.createChart(...args); window.chartToolsNative.push({ chart, host: args[0] }); return chart; };
          export const createSeriesMarkers = (...args) => { window.chartToolsMarkers.push(args[1]); return native.createSeriesMarkers(...args); };` });
      });
      await page.route('**/src/shared/api/client.*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const getDesktopApiClient = () => window.chartToolsApi;' }));
      await page.route('**/test/arena-read/**', (route) => { reads.push(route.request().url()); return route.fulfill({ body: '{}' }); });
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => { throw new Error(`未声明请求：${route.request().url()}`); });
      await page.goto(`${origin}/test/browser-chart-view-tools.html`);
      const stock = page.getByRole('region', { name: '股票视图验证', exact: true });
      const fund = page.getByRole('region', { name: '基金视图验证', exact: true });
      await fund.locator('canvas').first().waitFor();
      assert.deepEqual(await buttons(stock), tools); assert.deepEqual(await buttons(fund), tools);
      await fund.getByRole('button', { name: '放大图表', exact: true }).click();
      const zoom1 = await range(fund);
      await fund.getByRole('button', { name: '放大图表', exact: true }).click();
      const zoom2 = await range(fund); assert(zoom2.to - zoom2.from < zoom1.to - zoom1.from);
      await fund.getByRole('button', { name: '查看更早日期', exact: true }).click(); const earlier = await range(fund); assert(earlier.from < zoom2.from);
      await fund.getByRole('button', { name: '查看更晚日期', exact: true }).click(); sameRange(await range(fund), zoom2);
      await fund.getByRole('button', { name: '缩小图表', exact: true }).click(); assert((await range(fund)).to - (await range(fund)).from > zoom2.to - zoom2.from);
      await fund.getByRole('button', { name: '回到最新', exact: true }).click(); assert(Math.abs((await range(fund)).to - 89) < .001);
      await fund.getByRole('button', { name: '重置', exact: true }).click();
      const beforePnl = await range(fund);
      await fund.getByRole('button', { name: '补充盈亏记录', exact: true }).click();
      const afterPnl = await range(fund); sameRange(afterPnl, { from: beforePnl.from + 1, to: beforePnl.to + 1 });
      await fund.getByText('参考与测量', { exact: true }).click(); await fund.getByRole('button', { name: '成本参考', exact: true }).click();
      await fund.getByRole('button', { name: '放大图表', exact: true }).click();
      const beforeFull = await range(fund);
      await fund.getByRole('button', { name: '全屏', exact: true }).click();
      const full = page.getByRole('dialog', { name: '基金净值历史', exact: true });
      await full.locator('canvas').first().waitFor(); await page.waitForTimeout(100);
      sameRange(await range(full), beforeFull);
      await full.getByText('参考与测量', { exact: true }).click();
      assert.equal(await full.getByRole('button', { name: '成本参考', exact: true }).getAttribute('aria-pressed'), 'true');
      await full.getByRole('button', { name: '区间测量', exact: true }).click();
      await full.locator('canvas').first().scrollIntoViewIfNeeded();
      await clickPoint(page, full, Math.ceil(beforeFull.from + 2));
      await full.getByText('请选择净值区间终点；Esc 可取消。', { exact: true }).waitFor();
      await page.waitForTimeout(550); await clickPoint(page, full, Math.floor(beforeFull.to - 2));
      await full.getByLabel('净值区间测量结果', { exact: true }).waitFor();
      await page.keyboard.press('Escape'); await full.getByLabel('净值区间测量结果', { exact: true }).waitFor({ state: 'hidden' }); assert(await full.isVisible());
      await page.waitForTimeout(550); const marker = await tradePixel(full); assert(marker);
      await page.mouse.click(marker.x, marker.y); const tradeDetail = page.getByRole('dialog', { name: '成交详情', exact: true });
      await tradeDetail.waitFor(); await page.keyboard.press('Escape'); await tradeDetail.waitFor({ state: 'hidden' }); assert(await full.isVisible());
      await page.keyboard.press('Escape'); await full.waitFor({ state: 'hidden' });
      assert(await fund.getByRole('button', { name: '全屏', exact: true }).evaluate((node) => node === document.activeElement));
      sameRange(await range(fund), beforeFull);
      await fund.getByRole('button', { name: '今日', exact: true }).click();
      await fund.locator('[data-fund-intraday-chart] canvas').first().waitFor(); assert.deepEqual(await buttons(fund), tools);
      const todayRange = await range(fund);
      await fund.getByRole('button', { name: '放大图表', exact: true }).click(); const todayZoom = await range(fund); assert(todayZoom.to - todayZoom.from < todayRange.to - todayRange.from);
      await fund.getByRole('button', { name: '全屏', exact: true }).click(); const todayFull = page.getByRole('dialog', { name: '基金盘中估值', exact: true });
      await todayFull.locator('canvas').first().waitFor(); await page.waitForTimeout(100); sameRange(await range(todayFull), todayZoom);
      await page.keyboard.press('Escape'); await todayFull.waitFor({ state: 'hidden' }); sameRange(await range(fund), todayZoom);
      await fund.getByRole('button', { name: '重置', exact: true }).click(); sameRange(await range(fund), todayRange);
      // 聚合周期点位入口及桶内原始事实。
      await stock.getByRole('button', { name: '周线', exact: true }).click(); await stock.getByText('交易参考与测量', { exact: true }).click();
      assert.equal(reads.length, 0);
      await stock.getByRole('button', { name: '模型模拟买卖点', exact: true }).click();
      await stock.getByRole('button', { name: '视图验证比赛', exact: true }).click();
      await stock.getByRole('link', { name: /2026-11-04.*验证模型.*模拟买入/ }).waitFor();
      await page.waitForFunction(() => window.chartToolsMarkers.some((markers) => markers.some((marker) => marker.time === '2026-11-06' && marker.text === '验证模型 模拟买')));
      await page.waitForFunction(() => window.chartToolsLabels.length > 0);
      const pointsRead = reads.find((url) => url.includes('/points?')); assert(pointsRead);
      const firstWeekEnd = Date.UTC(2026, 10, 6) - 89 * 7 * 86400000;
      assert.equal(new URL(pointsRead).searchParams.get('start'), new Date(firstWeekEnd - 4 * 86400000).toISOString().slice(0, 10));
      await stock.locator('canvas').first().scrollIntoViewIfNeeded(); await clickPoint(page, stock, 89);
      assert.equal(await stock.getByRole('link', { name: /2026-10-28.*模拟卖出/ }).count(), 0);
      assert.equal(await stock.getByRole('link', { name: /2026-11-04.*模拟买入/ }).count(), 1);
      await stock.getByRole('button', { name: '1 分钟', exact: true }).click();
      assert(await stock.getByRole('button', { name: '模型模拟买卖点', exact: true }).isDisabled());
      await stock.getByRole('button', { name: '模型模拟买卖点说明', exact: true }).click();
      await page.getByText('模型点位按交易日记录，请切换日线、周线等日级周期查看。', { exact: true }).waitFor(); await page.keyboard.press('Escape');
      await stock.getByRole('button', { name: '周线', exact: true }).click();
      assert.equal(await stock.getByRole('button', { name: '模型模拟买卖点', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.screenshot({ path: `${output}/tools-${width}.png`, fullPage: true, animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
      results.push({ width, identicalTools: true, fundNavigation: true, pnlRefreshViewport: true, fullscreenViewport: true, measurementEscape: true, costRetained: true, fullscreenTradeDetails: true, todayTools: true, weeklyModelMarkers: true, originalFactDate: true, minuteExplanation: true, overflow: false });
      console.log(JSON.stringify(results.at(-1))); await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
