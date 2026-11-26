const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.SECURITY_INFO_QA_OUTPUT || '/tmp/security-info-qa';
const origin = process.env.SECURITY_INFO_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });

function sample(symbol, assetType) {
  return {
    contractVersion: 1, consumer: 'thesis-ledger', requestId: 'controlled', symbol, assetType,
    market: symbol.endsWith('.HK') ? 'HK' : 'US', name: symbol === 'SPY.US' ? '标普500 ETF' : '招商银行',
    securityId: '9007199254740993', sharesPerLot: '100', listingDate: '2006-09-22', delisted: false,
    exchange: '受控交易所', provider: 'futu', historicalChanges: 'unverified',
    observedAt: '2026-11-10T01:00:00Z', fetchedAt: '2026-11-10T01:01:00Z', policyRevision: 1,
    routeTarget: { providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 },
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_EXECUTABLE });
  const results = [];
  let activePage;
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      activePage = page;
      page.setDefaultTimeout(15000);
      const errors = [], calls = [], writes = [];
      let mode = 'ready', release;
      page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
      await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const request = route.request(), url = new URL(request.url());
        if (url.pathname.endsWith('/security-static-info')) {
          calls.push({ symbol: url.searchParams.get('symbol'), type: url.searchParams.get('assetType') });
          const activeMode = mode;
          if (activeMode === 'pending') await new Promise((resolve) => { release = resolve; });
          if (activeMode === 'failed') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '受控资料来源不可用' }) });
          return route.fulfill({ contentType: 'application/json', body: JSON.stringify(sample(url.searchParams.get('symbol'), url.searchParams.get('assetType'))) });
        }
        if (request.method() !== 'GET') writes.push({ method: request.method(), path: url.pathname });
        return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: '受控行情读取失败' }) });
      });
      await page.goto(origin + '/test/browser-security-info.html');
      assert.equal(await page.getByRole('button', { name: '查询证券资料', exact: true }).count(), 0);
      const open = page.getByRole('button', { name: '查看 03968.HK 行情', exact: true });
      mode = 'pending';
      await open.click();
      await page.getByRole('status', { name: '正在读取证券资料', exact: true }).waitFor();
      assert.deepEqual(calls, [{ symbol: '03968.HK', type: 'STOCK' }]);
      release();
      const table = page.getByRole('table', { name: '03968.HK 证券资料', exact: true });
      await table.getByText('9007199254740993').waitFor();
      await table.scrollIntoViewIfNeeded();
      mode = 'pending';
      await page.getByRole('button', { name: '刷新证券资料', exact: true }).click();
      await page.getByRole('status', { name: '正在刷新证券资料', exact: true }).waitFor();
      assert(await table.getByText('9007199254740993').isVisible());
      await page.screenshot({ path: `${output}/refresh-${width}.png` });
      release();
      await page.getByRole('status', { name: '正在刷新证券资料', exact: true }).waitFor({ state: 'hidden' });
      mode = 'failed';
      await page.getByRole('button', { name: '刷新证券资料', exact: true }).click();
      await page.getByText('已保留上次资料。', { exact: true }).waitFor();
      assert(await table.getByText('9007199254740993').isVisible());
      await page.screenshot({ path: `${output}/failed-${width}.png` });
      mode = 'ready';
      await page.getByRole('button', { name: '重试证券资料', exact: true }).click();
      await page.getByText('已保留上次资料。', { exact: true }).waitFor({ state: 'hidden' });
      const bounds = await page.getByRole('dialog').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, page: document.documentElement.scrollWidth,
          tables: [...element.querySelectorAll('[data-slot="table-container"]')].map((node) => ({ width: node.clientWidth, scroll: node.scrollWidth })) };
      });
      assert(bounds.left >= -1 && bounds.right <= width + 1 && bounds.top >= -1 && bounds.bottom <= 1001, JSON.stringify(bounds));
      assert(bounds.page <= width && bounds.tables.every((value) => value.scroll <= value.width), JSON.stringify(bounds));
      await page.screenshot({ path: `${output}/ready-${width}.png` });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      // 详情由目录中的显式按钮打开，关闭后应将键盘焦点交还原入口。
      assert(await open.evaluate((element) => document.activeElement === element));
      const before = calls.length;
      await open.click();
      await table.waitFor();
      assert.equal(calls.length, before, '再次打开复用当前资料缓存');
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      await page.getByRole('button', { name: '查看 SPY.US 行情', exact: true }).click();
      await page.getByRole('table', { name: 'SPY.US 证券资料', exact: true }).waitFor();
      assert.deepEqual(calls.at(-1), { symbol: 'SPY.US', type: 'ETF' });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      const supportedCalls = calls.length;
      await page.getByRole('button', { name: '查看 600036.SH 行情', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      assert.equal(await page.getByText('当前资料，历史变更未核验。', { exact: true }).count(), 0);
      assert.equal(calls.length, supportedCalls);
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      results.push({ width, bounds, staticReads: calls.length, errors, realWrites: 0, source: '受控资料与行情失败样本' });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      activePage = undefined;
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } catch (error) {
    if (activePage) {
      await activePage.screenshot({ path: `${output}/failure.png` });
      console.error((await activePage.locator('body').innerText()).slice(0,3000));
    }
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
