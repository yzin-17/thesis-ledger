const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/routing-recommendation-review-qa';
const snapshot = (page) => page.locator('section[aria-label]').evaluateAll((nodes) => nodes
  .filter((node) => node.querySelector('h2') && node.querySelector('[role="combobox"]'))
  .map((node) => ({ label: node.getAttribute('aria-label'), selections: [...node.querySelectorAll('[role="combobox"]')]
    .map((element) => element.textContent), text: node.textContent })));

(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(20000);
      const writes = [], errors = [], saves = [];
      let fixture = false, baseline, posted, savedConfig;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (path === '/api/market-data/routing-config' && request.method() === 'GET') {
          const response = await route.fetch();
          baseline = await response.json();
          if (fixture) baseline = { ...baseline, pendingChanges: 0, legacyRuleCount: 0,
            config: { ...baseline.config, keys: [baseline.config.keys.find((key) => key.kind === 'bar'
              && key.market === 'CN' && key.assetType === 'STOCK' && key.timeframe === '1d' && key.adjustment === 'none')],
            rules: [{ scope: { category: 'market' }, providers: ['akshare'] },
              ...baseline.config.rules.filter((rule) => rule.scope.category !== 'market')], preserved: [] } };
          if (savedConfig) baseline = { ...baseline, revision: baseline.revision + 1, config: savedConfig };
          return route.fulfill({ json: baseline });
        }
        if (fixture && path === '/api/market-data/routes/capabilities' && request.method() === 'GET') {
          const response = await route.fetch(), catalog = await response.json();
          return route.fulfill({ json: { ...catalog, entries: catalog.entries.filter((entry) =>
            entry.key.kind === 'bar' && entry.key.market === 'CN' && entry.key.assetType === 'STOCK'
            && entry.key.timeframe === '1d' && entry.key.adjustment === 'none'
            && entry.target.providerId === 'akshare' && ['sina', 'eastmoney'].includes(entry.target.upstreamSource))
            .map((entry) => ({ ...entry, recommendation: { upstreamGroup: entry.target.upstreamSource, reason: '受控同等条件' } })) } });
        }
        if (path === '/api/market-data/routing-config/preview' && request.method() === 'POST') {
          posted = request.postDataJSON();
          return route.continue();
        }
        if (path === '/api/market-data/routing-config' && request.method() === 'PUT') {
          saves.push(request.postDataJSON());
          if (saves.length === 1) return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
          savedConfig = request.postDataJSON().config;
          return route.fulfill({ json: { contractVersion: 3, consumer: 'thesis-ledger', requestId: 'controlled-save',
            revision: baseline.revision + 1, enabled: true, routes: [], syncState: 'applied',
            effectiveProjection: null, effectiveStale: true } });
        }
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          writes.push(request.method() + ' ' + path);
          return route.abort();
        }
        return route.continue();
      });
      try {
        await page.goto(origin + '/market-data');
        const category = page.locator('section[aria-label="行情与净值"]');
        await category.getByRole('button', { name: '采用建议主备', exact: true }).waitFor();
        const before = await snapshot(page);
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await category.getByRole('button', { name: '撤销本类建议', exact: true }).waitFor();
        assert.deepEqual((await snapshot(page)).filter((item) => item.label !== '行情与净值'), before.filter((item) => item.label !== '行情与净值'));
        await category.getByRole('button', { name: '查看推荐理由', exact: true }).click();
        await page.screenshot({ path: `${output}/real-${width}.png` });
        await page.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
        await page.screenshot({ path: `${output}/real-preview-${width}.png` });
        await page.getByRole('button', { name: '返回修改', exact: true }).click();
        await category.getByRole('button', { name: '撤销本类建议', exact: true }).click();
        assert.deepEqual(await snapshot(page), before);

        fixture = true;
        await page.reload();
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await category.getByText('待选择 1 项', { exact: true }).waitFor();
        assert(await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
        await page.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('dialog').getByText('1 项建议待选择，本次保留这些项的原配置。', { exact: true }).waitFor();
        const retained = posted.config.rules.find((item) => item.scope.category === 'market' && item.scope.capability);
        assert.deepEqual(retained.providers, ['akshare']);
        assert.deepEqual(retained.upstreamSources ?? {}, {});
        await page.getByRole('button', { name: '确认保存', exact: true }).click();
        await page.getByRole('dialog').getByRole('alert').waitFor();
        await page.getByRole('button', { name: '确认保存', exact: true }).click();
        await page.getByText('路由配置已保存并应用', { exact: true }).waitFor();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        assert.equal(saves.length, 2);
        assert.deepEqual(saves[0], saves[1]);
        assert.deepEqual(savedConfig.rules.find((item) => item.scope.category === 'market' && item.scope.capability), retained);
        await category.getByRole('button', { name: '采用建议主备', exact: true }).waitFor();
        saves.length = 0;
        savedConfig = undefined;
        await page.reload();
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await page.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
        await page.getByRole('button', { name: '返回修改', exact: true }).click();
        await category.getByRole('button', { name: /细分配置/ }).click();
        const sheet = page.getByRole('dialog');
        assert(await sheet.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
        await sheet.getByText('单独设置', { exact: true }).waitFor();
        const selects = sheet.getByRole('combobox', { name: '主数据源', exact: true });
        await selects.first().click();
        const option = page.getByRole('option', { name: 'AKShare · 新浪财经', exact: true });
        await option.click();
        await sheet.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
        const rule = posted.config.rules.find((item) => item.scope.category === 'market' && item.scope.capability);
        assert.deepEqual(rule.providers, ['akshare']);
        assert.equal(rule.upstreamSources.akshare, 'sina');
        assert.deepEqual(posted.config.rules.filter((item) => item.scope.category !== 'market'),
          baseline.config.rules.filter((item) => item.scope.category !== 'market'));
        await page.getByRole('button', { name: '返回修改', exact: true }).click();
        assert.equal(saves.length, 0);
        await page.getByRole('button', { name: '保存配置', exact: true }).click();
        await page.getByRole('button', { name: '确认保存', exact: true }).click();
        await page.getByRole('dialog').getByRole('alert').waitFor();
        await page.screenshot({ path: `${output}/controlled-save-${width}.png` });
        const geometry = await page.evaluate(() => ({ width: document.documentElement.scrollWidth,
          dialogs: [...document.querySelectorAll('[data-slot="sheet-content"]')].map((node) => {
            const rect = node.getBoundingClientRect(); return { left: rect.left, right: rect.right };
          }) }));
        assert(geometry.width <= width);
        assert(geometry.dialogs.length > 0);
        assert(geometry.dialogs.every((rect) => rect.left >= -1 && rect.right <= width + 1));
        await page.getByRole('button', { name: '确认保存', exact: true }).click();
        await page.getByText('路由配置已保存并应用', { exact: true }).waitFor();
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await category.getByRole('button', { name: '撤销本类建议', exact: true }).waitFor({ state: 'hidden' });
        assert.equal(await page.getByRole('dialog').count(), 0);
        assert.equal(await category.getByRole('button', { name: '撤销本类建议', exact: true }).count(), 0);
        assert.equal(saves.length, 2);
        assert.deepEqual(saves[0], saves[1]);
        assert.deepEqual(writes, []); assert.deepEqual(errors, []);
        const result = { width, categoryIsolation: true, undo: true, pendingSaveAllowed: true, pendingBindingPreserved: true,
          realPreview: true, pendingSaveFailureRetry: true, pendingSaveSuccess: true,
          preciseSelection: true, previewCancel: true, controlledSaveFailure: true, controlledSaveSuccess: true,
          dialogBounds: true, realWrites: writes.length };
        results.push(result); console.log(JSON.stringify(result));
      } finally { await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.close(); }
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
