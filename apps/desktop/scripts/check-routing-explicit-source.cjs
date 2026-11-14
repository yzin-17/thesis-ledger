const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/routing-explicit-source-qa';
const scope = {
  category: 'market',
  market: 'CN',
  assetType: 'STOCK',
  capability: 'DAILY_BAR',
  timeframe: '1d',
  adjustment: 'qfq',
};
const matches = (rule) => Object.entries(scope).every(([key, value]) => rule.scope[key] === value);
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(15000);
      let view, submitted, checkStatus;
      const writes = [],
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request();
          const path = new URL(request.url()).pathname;
          if (path === '/api/market-data/routing-config' && request.method() === 'GET') {
            const response = await route.fetch();
            view = await response.json();
            view.config.rules = [
              ...view.config.rules.filter((rule) => !matches(rule)),
              { scope, providers: ['futu', 'akshare'] },
            ];
            return route.fulfill({ json: view });
          }
          if (path === '/api/market-data/routing-config/preview' && request.method() === 'POST') {
            submitted = request.postDataJSON();
            const response = await route.fetch();
            checkStatus = response.status();
            if (!response.ok())
              console.log(
                JSON.stringify({ width, checkStatus, message: (await response.json()).message }),
              );
            return route.fulfill({ response });
          }
          if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            writes.push(request.method() + ' ' + path);
            return route.abort();
          }
          return route.continue();
        },
      );
      try {
        await page.goto(origin + '/market-data');
        const category = page.locator('section[aria-label="行情与净值"]');
        await category.getByRole('button', { name: /细分配置/ }).click();
        const sheet = page.getByRole('dialog');
        const row = () =>
          sheet.locator('[data-slot="routing-source-row"]').filter({
            has: page.getByText('中国内地 · 股票 · 日线行情 · 日线 · 前复权', { exact: true }),
          });
        const backup = () => row().getByRole('combobox', { name: '备用数据源', exact: true });
        await page.getByText('AKShare · 请选择具体来源', { exact: true }).first().waitFor();
        assert.match(await backup().textContent(), /AKShare · 请选择具体来源/);
        assert.equal(await page.getByText('有未保存修改', { exact: true }).count(), 0);
        await backup().click();
        assert.equal(await page.getByRole('option', { name: /按能力匹配/ }).count(), 0);
        await page.getByRole('option', { name: 'AKShare · 东方财富', exact: true }).waitFor();
        await page.getByRole('option', { name: 'AKShare · 新浪财经', exact: true }).waitFor();
        const popup = await page.locator('[data-slot="select-content"]').evaluateAll((nodes) =>
          nodes.map((node) => {
            const r = node.getBoundingClientRect();
            return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
          }),
        );
        assert(
          popup.every(
            (r) => r.left >= -1 && r.right <= width + 1 && r.top >= -1 && r.bottom <= 1001,
          ),
        );
        await page.screenshot({ path: `${output}/options-${width}.png` });
        await page.getByRole('option', { name: 'AKShare · 东方财富', exact: true }).click();
        await page.waitForFunction(
          (element) => element.getAttribute('aria-expanded') !== 'true',
          await backup().elementHandle(),
        );
        assert.match(await backup().textContent(), /^AKShare · 东方财富/);
        await sheet.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
        const changed = submitted.config.rules.find(matches);
        assert.deepEqual(changed.providers, ['futu', 'akshare']);
        assert.deepEqual(changed.upstreamSources, { akshare: 'eastmoney' });
        assert.deepEqual(
          submitted.config.rules.filter((rule) => !matches(rule)),
          view.config.rules.filter((rule) => !matches(rule)),
        );
        assert.deepEqual(submitted.config.keys, view.config.keys);
        assert.deepEqual(submitted.config.preserved, []);
        await page.getByRole('button', { name: '返回修改', exact: true }).click();
        await category.getByRole('button', { name: /细分配置/ }).click();
        assert.match(await backup().textContent(), /^AKShare · 东方财富/);
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
        assert.deepEqual(writes, []);
        assert.deepEqual(errors, []);
        const result = {
          width,
          concreteSource: changed.upstreamSources.akshare,
          requestBytes: Buffer.byteLength(JSON.stringify(submitted)),
          unrelatedRulesUnchanged: true,
          realWrites: writes.length,
          errors,
        };
        results.push(result);
        console.log(JSON.stringify(result));
      } catch (error) {
        await page.screenshot({ path: `${output}/failure-${width}.png` });
        console.log(
          JSON.stringify({
            width,
            checkStatus,
            submitted: Boolean(submitted),
            headings: await page.getByRole('heading').allTextContents(),
            alerts: await page.getByRole('alert').allTextContents(),
          }),
        );
        throw error;
      } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.close();
      }
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
