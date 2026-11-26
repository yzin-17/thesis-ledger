const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.CHART_PERIOD_QA_OUTPUT || '/tmp/chart-period-qa';
const origin = process.env.CHART_PERIOD_QA_BASE_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHART_PERIOD_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(10000);
      const errors = [], reads = [], held = new Map();
      let holding = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/src/features/market-detail/market-detail.api.*', (route) => route.fulfill({ contentType: 'text/javascript', body: 'export const requestMarketDetail = (...args) => window.periodFixtureRead(...args);' }));
      await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
        const url = new URL(route.request().url());
        if (!url.pathname.endsWith('/chart-options')) return route.fulfill({ status: 503, json: { message: '受控资料读取失败' } });
        return route.fulfill({ json: { contractVersion: 1, symbol: '600036.SH', mode: 'v3',
          window: { start: '2026-01-01', end: '2026-11-06' },
          plan: { barsLimit: Number(url.searchParams.get('barsLimit')), indicatorParams: JSON.parse(url.searchParams.get('indicatorParams') || '{}') },
          options: ['none', 'qfq', 'hfq'].map((adjustment) => ({ adjustment, available: true, reason: null })) } });
      });
      await page.route('**/test/period-read?*', (route) => {
        const read = Object.fromEntries(new URL(route.request().url()).searchParams);
        reads.push(read);
        if (holding) held.set(read.timeframe, route);
        else return route.fulfill({ body: '{}' });
      });
      await page.goto(`${origin}/test/browser-chart-period-viewport.html`);
      const dialog = page.getByRole('dialog').first();
      const plot = dialog.locator('[data-market-lightweight-chart]');
      const quote = dialog.locator('[data-market-detail-section="quote"]');
      const caption = dialog.locator('figcaption').first();
      await plot.locator('canvas').first().waitFor();
      await quote.getByText('11.23', { exact: false }).first().waitFor();
      if (width >= 1024) {
        await dialog.getByRole('button', { name: '相关资讯', exact: true }).click();
        await dialog.getByRole('tab', { name: '公告', exact: true }).click();
      }
      const baselineQuote = await quote.innerText();
      await page.evaluate(() => { window.savedDialog = document.querySelector('[role="dialog"]'); window.savedCanvas = document.querySelector('[data-market-lightweight-chart] canvas'); window.savedQuote = document.querySelector('[data-market-detail-section="quote"]'); window.savedSidebar = document.querySelector('aside[aria-label="相关资讯"]'); });
      const assertInstances = async () => assert(await page.evaluate(() => window.savedDialog === document.querySelector('[role="dialog"]') && window.savedCanvas === document.querySelector('[data-market-lightweight-chart] canvas') && window.savedQuote === document.querySelector('[data-market-detail-section="quote"]')));
      const assertSidebar = async () => {
        if (width < 1024) return;
        assert.equal(await dialog.getByRole('tab', { name: '公告', exact: true }).getAttribute('aria-selected'), 'true');
        assert(await page.evaluate(() => window.savedSidebar === document.querySelector('aside[aria-label="相关资讯"]') && !window.savedSidebar.hidden));
      };
      const select = async (label) => {
        if (label === '日线' || label === '周线') await dialog.getByRole('button', { name: label, exact: true }).click();
        else { await dialog.getByRole('combobox', { name: '更多周期', exact: true }).click(); await page.getByRole('option', { name: label, exact: true }).click(); }
      };
      const probeLatest = async () => {
        await page.evaluate(() => { window.fixtureOriginalNow = Date.now; Date.now = () => window.fixtureOriginalNow() + 61000; });
        await dialog.getByRole('button', { name: '回到最新', exact: true }).click();
        await plot.scrollIntoViewIfNeeded();
        const box = await plot.boundingBox();
        await page.mouse.move(box.x + box.width * .7, box.y + 90); await page.mouse.down();
        await page.mouse.move(box.x + box.width * .3, box.y + 90, { steps: 10 }); await page.mouse.up();
        await page.evaluate(() => { Date.now = window.fixtureOriginalNow; });
      };
      const release = async (period) => { await held.get(period).fulfill({ body: '{}' }); held.delete(period); };
      const waitHeld = async (period) => { for (let i = 0; i < 100 && !held.has(period); i++) await page.waitForTimeout(20); assert(held.has(period), `missing request ${period}`); };
      await dialog.evaluate((node) => { const scroller = [...node.querySelectorAll('div')].find((el) => el.classList.contains('overflow-y-auto') && el.contains(node.querySelector('[data-market-price-chart]'))); window.savedScroll = scroller; scroller.scrollTop = 60; window.savedScrollTop = scroller.scrollTop; });
      holding = true;
      await select('周线'); await waitHeld('1w');
      await assertInstances();
      assert.equal(await quote.innerText(), baselineQuote);
      await assertSidebar();
      assert(await page.evaluate(() => window.savedScroll.scrollTop === window.savedScrollTop));
      assert.equal(await dialog.getByText('正在刷新行情详情', { exact: true }).count(), 0);
      assert.equal(await dialog.getByRole('status', { name: '正在读取行情图数据' }).count(), 1);
      assert.equal(reads.at(-1).include, 'bars,indicator:MA,indicator:MACD,indicator:RSI');
      assert.equal(reads.at(-1).anchor, '');
      await select('月线'); await waitHeld('1mo');
      await release('1mo');
      await dialog.getByText('最近月线', { exact: true }).waitFor();
      await release('1w'); await page.waitForTimeout(150);
      assert.equal(await dialog.getByText('最近月线', { exact: true }).count(), 1);
      await assertInstances();
      // fresh cache 立即恢复日线，不能被旧月线覆盖。
      await select('日线');
      assert.equal(await dialog.getByText('日线走势', { exact: true }).count(), 1);
      await page.waitForTimeout(100);
      await select('周线'); await waitHeld('1w'); await release('1w');
      await dialog.getByText('最近周线', { exact: true }).waitFor();
      await assertInstances();
      await assertSidebar();
      await dialog.getByRole('button', { name: '一年', exact: true }).click();
      await plot.scrollIntoViewIfNeeded();
      const spans = [];
      for (let i = 0; i < 5; i++) {
        await dialog.getByRole('button', { name: '放大图表', exact: true }).click();
        await page.waitForTimeout(80);
        spans.push(await caption.locator('span').first().innerText());
      }
      assert(new Set(spans).size >= 4, `zoom stopped: ${spans}`);
      await dialog.getByRole('button', { name: '查看更早日期', exact: true }).click();
      await page.waitForTimeout(100);
      const panned = await caption.locator('span').first().innerText();
      await plot.scrollIntoViewIfNeeded();
      const bounds = await plot.boundingBox();
      await page.mouse.move(bounds.x + bounds.width * 0.45, bounds.y + 90);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * 0.7, bounds.y + 90, { steps: 10 });
      await page.mouse.up();
      await page.waitForTimeout(100);
      const stable = await caption.locator('span').first().innerText();
      assert.notEqual(stable, panned, 'native drag did not move viewport');
      const trace = await caption.locator('span').first().evaluate(async (node) => {
        const values = [];
        for (let i = 0; i < 30; i++) { await new Promise(requestAnimationFrame); values.push(node.textContent); }
        return values;
      });
      assert(trace.every((value) => value === stable), `viewport oscillated: ${trace}`);
      await assertInstances();
      await probeLatest();
      await waitHeld('1w');
      await select('年线'); await waitHeld('1y');
      assert.equal(reads.at(-1).limit, '2');
      assert.equal(reads.at(-1).anchor, '');
      await release('1y'); await dialog.getByText('最近年线', { exact: true }).waitFor();
      await release('1w');
      await select('日线'); assert.equal(reads.filter((read) => read.timeframe === '1d').at(-1).limit, '90');
      await page.waitForTimeout(100);
      await probeLatest();
      await waitHeld('1d'); await release('1d');
      await page.waitForTimeout(100);
      await assertInstances();
      assert.equal(await quote.innerText(), baselineQuote);
      await page.screenshot({ path: `${output}/period-${width}.png`, fullPage: true, animations: 'disabled' });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.deepEqual(errors, []);
      results.push({ width, persistentDialogAndCanvas: true, quoteRetained: true, sidebarRetained: width >= 1024, scrollRetained: true, lateResponseIgnored: true, cachedReturn: true, annualLimit: 2, latestProbeSwitch: true, zoomSteps: spans, nativeDrag: true, stableFrames: trace.length, overflow: false });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally { writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2)); await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
