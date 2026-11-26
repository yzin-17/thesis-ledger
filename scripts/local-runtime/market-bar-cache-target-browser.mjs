import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const schemas = await import('../../packages/schemas/dist/index.js');
globalThis.window = {};
const { fixture, requestMarketDetail } = await import('../../apps/desktop/test/minute-auto-refresh-fixture.ts');
const basis = JSON.parse(await readFile(new URL('../../packages/schemas/fixtures/market-data-v3.response.etf-qfq.json', import.meta.url))).sourcePriceBasis;
const output = process.env.CACHE_QA_OUTPUT;
assert(output, '必须指定回执目录');
await mkdir(output, { recursive: true, mode: 0o700 });
const itemId = '00000000-0000-4000-8000-000000000001';
const instrumentId = '00000000-0000-4000-8000-000000000002';
const watchlist = schemas.watchlistPageSchema.parse({ revision: 0, groups: [], nextOffset: null,
  items: [{ id: itemId, instrument: { id: instrumentId, canonicalCode: '600036', market: 'SH', instrumentType: 'STOCK', active: true },
    displayName: '招商银行', groupId: null, pinned: false, order: 0, addedAt: '2026-11-12T00:00:00Z' }] });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const reports = [];
let forbiddenWrites = 0;
let blockedOtherMarketReads = 0;
let activePage;
const visited = [];
try {
  for (const width of [1440, 1024, 768, 390]) {
    fixture.delay = 0; fixture.fail = false;
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    activePage = page;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('thesis-ledger:market-period-preference', '1m'));
    await page.route('**/*', async route => {
      const request = route.request(); const url = new URL(request.url());
      if (request.resourceType() === 'fetch' || request.resourceType() === 'xhr') visited.push({ path: url.pathname, method: request.method() });
      const json = value => route.fulfill({ json: value });
      if (url.pathname === '/api/v1/watchlist') return json(watchlist);
      if (url.pathname === '/api/v1/watchlist/prices') return json({ rows: [] });
      if (url.pathname.match(/^\/api\/market\/[^/]+\/chart-options$/u)) {
        const timeframe = url.searchParams.get('timeframe') ?? '1d';
        const day = '2026-11-12';
        const plan = url.searchParams.has('barsLimit') ? {
          barsLimit: Number(url.searchParams.get('barsLimit')), indicatorParams: JSON.parse(url.searchParams.get('indicatorParams') ?? '{}'),
          ...(url.searchParams.has('planEnd') ? { end: url.searchParams.get('planEnd') } : {}),
          ...(url.searchParams.has('timeframe') ? { timeframe } : {}),
          ...(url.searchParams.has('assetType') ? { assetType: url.searchParams.get('assetType') } : {}),
        } : undefined;
        return json(schemas.marketChartOptionsV3Schema.parse({ contractVersion: 1, symbol: '600036.SH', mode: 'v3', timeframe,
          ...(plan ? { plan, window: { start: day, end: day } } : {}),
          options: ['none', 'qfq', 'hfq'].map(adjustment => ({ adjustment,
            available: adjustment === 'none', reason: adjustment === 'none' ? null : 'unsupported_adjustment' })) }));
      }
      if (url.pathname.match(/^\/api\/market\/[^/]+\/detail$/u)) {
        if (fixture.delay) await delay(fixture.delay);
        if (fixture.fail) return route.fulfill({ status: 502, json: { message: '受控行情刷新失败' } });
        const detail = await requestMarketDetail({ symbol: '600036.SH', timeframe: url.searchParams.get('timeframe') ?? '1d',
          adjustment: url.searchParams.get('adjustment') ?? 'none', refresh: url.searchParams.get('refresh') === '1' });
        const at = detail.generatedAt;
        detail.barSeries.chartContextV3 = { purpose: 'interactive-chart', requestedStart: '2026-11-12', requestedEnd: '2026-11-12',
          acquisitionFingerprint: 'controlled-target-browser', sourcePriceBasis: { ...basis, adjustment: detail.barSeries.identity.adjustment, observedAt: at } };
        const parsed = schemas.marketDetailResponseSchema.safeParse(detail);
        assert(parsed.success, JSON.stringify(parsed.error?.issues.map(issue => ({ path: issue.path, code: issue.code }))));
        return json(parsed.data);
      }
      if (url.pathname.match(/^\/api\/market\/[^/]+\/minute-options$/u))
        return json({ symbol: '600036.SH', timeframe: '1m', options: [{ adjustment: 'none', available: true }] });
      if (url.pathname.startsWith('/api/market/')) { blockedOtherMarketReads++; return route.abort(); }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) { forbiddenWrites++; return route.abort(); }
      return route.continue();
    });
    await page.goto(`${process.env.CACHE_QA_ORIGIN ?? 'http://127.0.0.1:5173'}/watchlist?item=${itemId}`);
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({ timeout: 20000 });
    const canvas = dialog.locator('canvas').first(); await canvas.waitFor({ state: 'visible' });
    const refresh = dialog.getByRole('button', { name: '刷新行情', exact: true });
    const indicator = dialog.locator('[data-slot="list-refresh"][aria-label="正在读取行情图数据"]');
    fixture.delay = 1000;
    const before = fixture.requests.length;
    await refresh.click(); await indicator.waitFor();
    assert.equal(await indicator.count(), 1); assert(await canvas.isVisible());
    await page.screenshot({ path: join(output, `${width}-refresh.png`), fullPage: true });
    await indicator.waitFor({ state: 'hidden' });
    assert(fixture.requests.slice(before).some(request => request.refresh));
    fixture.fail = true;
    await refresh.click(); await indicator.waitFor(); await indicator.waitFor({ state: 'hidden' });
    assert(await canvas.isVisible());
    await dialog.getByText('行情详情刷新失败', { exact: true }).waitFor();
    await page.screenshot({ path: join(output, `${width}-failure.png`), fullPage: true });
    fixture.fail = false; fixture.delay = 0;
    await refresh.click(); await dialog.getByText('行情详情刷新失败', { exact: true }).waitFor({ state: 'hidden' });
    const bounds = await dialog.boundingBox();
    assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth); assert(overflow <= 1);
    fixture.delay = 1000;
    await refresh.click(); await indicator.waitFor();
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    fixture.delay = 0;
    await page.getByRole('button', { name: /招商银行.*600036/ }).click(); await dialog.waitFor();
    await canvas.waitFor({ state: 'visible' });
    assert.deepEqual(errors, []);
    reports.push({ width, actualTargetPage: true, controlledReads: true, retainedChart: true,
      oneChartSpinner: true, refreshFlag: true, errorVisible: true, recovered: true, cancelledInFlight: true, reopened: true, overflow });
    await page.close();
  }
  const report = { passed: true, reports, forbiddenWrites, blockedOtherMarketReads, providerPriceCalls: 0, completedAt: new Date().toISOString() };
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(report));
} catch (error) {
  if (activePage && !activePage.isClosed()) await activePage.screenshot({ path: join(output, 'failure.png'), fullPage: true });
  await writeFile(join(output, 'failure.json'), JSON.stringify({ errorType: error.name, visited, forbiddenWrites, blockedOtherMarketReads }, null, 2), { flag: 'wx', mode: 0o600 });
  throw error;
} finally { await browser.close(); }
