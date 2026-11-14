const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../test/fixtures/experiment-risk-ui-recovery.json');
const base = process.env.EXPERIMENT_INSTRUMENT_QA_URL || 'http://localhost:5173';
const mobile = process.env.EXPERIMENT_INSTRUMENT_MOBILE_QA_URL || 'http://127.0.0.1:5187';
const output = '/tmp/experiment-instrument-qa';
const live = process.argv.includes('--live-readonly');
fs.mkdirSync(output, { recursive: true });
const items = [
  ['300058.SZ', '蓝色光标'],
  ['600519.SH', '贵州茅台'],
].map(([symbol, name], index) => ({
  ...fixture.experiment,
  id: `11111111-1111-4111-8111-11111111111${index}`,
  name: index === 0 ? '从零探索 · 300058.SZ' : '自定义实验名称保持原样',
  sourceMode: 'discovery',
  executionSymbol: symbol,
  source: {
    kind: 'discovery',
    experimentId: `11111111-1111-4111-8111-11111111111${index}`,
    strategySpaceVersion: 'strategy-space-price-research-v1',
    discoveryScope: {
      executionInstrument: { symbol, market: 'CN', assetType: 'stock' },
      primaryTimeframe: '1d',
    },
  },
  instrumentDirectory: {
    generation: 1,
    unresolvedSymbols: [],
    items: [
      {
        symbol,
        canonicalCode: symbol.split('.')[0],
        market: symbol.split('.')[1],
        instrumentType: 'STOCK',
        displayName: name,
        active: true,
      },
    ],
  },
}));
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const results = [];
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      const errors = [],
        writes = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (request.method() !== 'GET') {
          writes.push(request.method() + ' ' + url.pathname);
          return route.abort();
        }
        if (!live && url.pathname.endsWith('/strategy-optimization/experiments'))
          return route.fulfill({
            json: {
              items,
              totalCount: items.length,
              pageInfo: { nextCursor: null, hasNextPage: false },
            },
          });
        if (!live && url.pathname.endsWith('/experiments/' + items[0].id))
          return route.fulfill({ json: { experiment: items[0], candidates: [], attempts: [] } });
        if (!live && url.pathname.endsWith('/experiments/' + items[0].id + '/compare'))
          return route.fulfill({
            json: {
              experiment: items[0],
              candidates: [],
              attempts: [],
              baseline: { metrics: {}, runRefs: {} },
              note: '受控比较',
            },
          });
        return route.continue();
      });
      let chosen = items[0];
      let instrumentLabel = '蓝色光标 · 300058.SZ';
      if (live) {
        const response = await page.request.get(base + '/api/v1/strategy-optimization/experiments?limit=25');
        const current = await response.json();
        chosen = current.items.find(item => item.executionSymbol === '300058.SZ');
        const entry = chosen?.instrumentDirectory?.items.find(item => item.symbol === chosen.executionSymbol);
        assert(entry && entry.displayName !== entry.symbol, '真实目录须返回标的名称');
        instrumentLabel = `${entry.displayName} · ${entry.symbol}`;
      }
      await page.goto(base + '/strategy/experiments');
      await page.getByText(instrumentLabel + ' · 从零探索', { exact: true }).first().waitFor();
      if (!live) await page.getByText('贵州茅台 · 600519.SH · 从零探索', { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({
        path: path.join(output, `${live ? 'live-' : ''}list-${width}.png`),
        fullPage: true,
      });
      if (live) await page.goto(base + '/strategy/experiments/' + chosen.id);
      else await page.getByRole('link', { name: items[0].name, exact: true }).click();
      await page.getByText(instrumentLabel, { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `${live ? 'live-' : ''}detail-${width}.png`), fullPage: true });
      if (!live) {
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `detail-${width}.png`), fullPage: true });
        await page.goto(mobile + '/test/browser-price-research-mobile.html');
        await page.getByText('蓝色光标 · 300058.SZ', { exact: true }).waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: path.join(output, `mobile-${width}.png`), fullPage: true });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      results.push({ width, liveReadonly: live, namesVisible: true, overflow: 0, writes: 0 });
      await page.close();
    }
    fs.writeFileSync(
      path.join(output, live ? 'live-results.json' : 'results.json'),
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
