const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/routing-inheritance-qa';
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
const exact = (s) =>
  s.market &&
  s.assetType &&
  s.capability &&
  (!['DAILY_BAR', 'MINUTE_BAR'].includes(s.capability) || (s.timeframe && s.adjustment));
const matchesMinute = (s) =>
  s.market === 'CN' &&
  s.assetType === 'STOCK' &&
  s.capability === 'MINUTE_BAR' &&
  s.timeframe === '1m' &&
  s.adjustment === 'none';
async function choose(page, name, option) {
  const trigger = page.getByRole('dialog').getByRole('combobox', { name, exact: true });
  await trigger.click();
  await page.getByRole('option', { name: option, exact: true }).click();
  await page.waitForFunction(
    (el) => el.getAttribute('aria-expanded') !== 'true',
    await trigger.elementHandle(),
  );
}
function savedPolicy(view, preview) {
  const policy = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'controlled-inheritance',
    revision: view.revision + 1,
    enabled: true,
    routes: preview.routes,
  };
  return {
    ...policy,
    syncState: 'applied',
    effectiveStale: false,
    effectiveProjection: {
      ...policy,
      sourceDesiredRevision: policy.revision,
      appliedAt: new Date().toISOString(),
      routes: policy.routes.map((route) => ({
        ...route,
        reason: null,
        targets: route.targets.map((target, routeIndex) => ({
          ...target,
          routeIndex,
          eligible: true,
          reason: null,
        })),
      })),
    },
  };
}
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const phases = [];
      for (const phase of ['restore', 'migration']) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        });
        page.setDefaultTimeout(15000);
        const errors = [],
          writes = [],
          saves = [];
        let view,
          preview,
          submitted,
          savedView,
          allowSuccess = false;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(
          (url) => url.pathname.startsWith('/api/'),
          async (route) => {
            const request = route.request(),
              path = new URL(request.url()).pathname;
            if (path === '/api/market-data/routing-config' && request.method() === 'GET') {
              if (savedView) return route.fulfill({ json: savedView });
              const response = await route.fetch();
              view = await response.json();
              return route.fulfill({ response });
            }
            if (path === '/api/market-data/routing-config/preview' && request.method() === 'POST') {
              submitted = request.postDataJSON();
              const response = await route.fetch();
              preview = await response.json();
              return route.fulfill({ response });
            }
            if (path === '/api/market-data/routing-config' && request.method() === 'PUT') {
              saves.push(request.postDataJSON());
              if (!allowSuccess)
                return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
              savedView = {
                ...view,
                revision: view.revision + 1,
                legacyRuleCount: 0,
                pendingChanges: 0,
                config: saves.at(-1).config,
                syncState: 'applied',
                diagnostics: preview.diagnostics,
              };
              return route.fulfill({ json: savedPolicy(view, preview) });
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
          await page.getByRole('heading', { name: '行情与净值', exact: true }).waitFor();
          assert(view.legacyRuleCount > 0);
          assert.equal(view.pendingChanges, 0);
          assert(view.config.rules.every((rule) => !rule.scope.market || exact(rule.scope)));
          assert.equal(await page.getByText('有未保存修改', { exact: true }).count(), 0);
          assert(await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
          if (phase === 'restore') {
            await page
              .locator('section[aria-label="行情与净值"]')
              .getByRole('button', { name: /细分配置/ })
              .click();
            await choose(page, '市场', '中国内地');
            await choose(page, '标的类型', '股票');
            await choose(page, '用途', '分钟行情');
            await choose(page, '周期', '1 分钟');
            await choose(page, '复权', '不复权');
            const sheet = page.getByRole('dialog');
            assert.equal(await sheet.getByText(/^跟随/).count(), 0);
            await sheet
              .getByRole('button', {
                name: '使用上级配置行情与净值 · 中国内地 · 股票 · 分钟行情 · 1 分钟 · 不复权',
                exact: true,
              })
              .click();
            await sheet.getByText('继承大类配置', { exact: true }).waitFor();
            await page.screenshot({ path: `${output}/restore-${width}.png` });
            await sheet.getByRole('button', { name: '保存配置', exact: true }).click();
            await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
            assert(!submitted.config.rules.some((rule) => matchesMinute(rule.scope)));
            assert.deepEqual(
              preview.diagnostics.find((item) => matchesMinute(item.key)).inheritedFrom,
              { category: 'market' },
            );
            assert.equal(saves.length, 0);
          } else {
            await page.getByRole('button', { name: '保存配置', exact: true }).click();
            await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
            assert(preview.previewToken);
            assert.equal(preview.changes.length, 0);
            assert.equal(preview.legacyRuleCount, view.legacyRuleCount);
            await page.getByText(/0 项来源变更/).waitFor();
            await page.getByText(new RegExp(`整理 ${view.legacyRuleCount} 项旧汇总配置`)).waitFor();
            await page.screenshot({ path: `${output}/preview-${width}.png` });
            await page.getByRole('button', { name: '确认保存', exact: true }).click();
            await page.getByRole('dialog').getByRole('alert').waitFor();
            allowSuccess = true;
            await page.getByRole('button', { name: '确认保存', exact: true }).click();
            await page.getByText('路由配置已保存并应用', { exact: true }).waitFor();
            assert.equal(saves.length, 2);
            assert.deepEqual(saves[0], saves[1]);
            assert(saves[0].config.rules.every((rule) => !rule.scope.market || exact(rule.scope)));
            assert(await page.getByRole('button', { name: '保存配置', exact: true }).isDisabled());
            assert.equal(await page.getByText(/项旧汇总配置已按具体项/).count(), 0);
          }
          const geometry = await page.evaluate(() => ({
            width: document.documentElement.scrollWidth,
            dialogs: [...document.querySelectorAll('[data-slot="sheet-content"]')].map((el) => {
              const r = el.getBoundingClientRect();
              return { left: r.left, right: r.right };
            }),
          }));
          assert(geometry.width <= width);
          assert(geometry.dialogs.every((r) => r.left >= -1 && r.right <= width + 1));
          assert.deepEqual(errors, []);
          assert.deepEqual(writes, []);
          phases.push({
            phase,
            legacyRuleCount: view.legacyRuleCount,
            previewChanges: preview.changes.length,
            controlledSaves: saves.length,
            realWrites: writes.length,
            errors,
          });
        } finally {
          await page.unrouteAll({ behavior: 'ignoreErrors' });
          await page.close();
        }
      }
      results.push({ width, phases });
      console.log(JSON.stringify(results.at(-1)));
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
