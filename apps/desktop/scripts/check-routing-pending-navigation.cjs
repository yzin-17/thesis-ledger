const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/routing-pending-navigation-qa';
const rows = (dialog) => dialog.locator('[data-slot="routing-source-row"]');
const labels = (dialog) => rows(dialog).evaluateAll((nodes) => nodes.map((node) => node.querySelector('span').textContent));

(async () => {
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      const writes = [], errors = [];
      let fixture = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request(), path = new URL(request.url()).pathname;
        if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
          writes.push(request.method() + ' ' + path);
          return route.abort();
        }
        if (fixture === 'pending' && path === '/api/market-data/routing-config') {
          const response = await route.fetch(), baseline = await response.json();
          return route.fulfill({ json: { ...baseline, config: { ...baseline.config,
            rules: baseline.config.rules.map((rule) => {
              const scope = rule.scope;
              if (scope.category === 'market' && scope.market === 'CN'
                && (scope.capability === 'REALTIME_QUOTE' || scope.adjustment === 'none')) {
                const { upstreamSources, ...unbound } = rule;
                return unbound;
              }
              return rule;
            }) } } });
        }
        if (fixture === 'single' && path === '/api/market-data/routing-config') {
          const response = await route.fetch(), baseline = await response.json();
          return route.fulfill({ json: { ...baseline, pendingChanges: 0, legacyRuleCount: 0,
            config: { ...baseline.config, keys: [baseline.config.keys.find((key) => key.kind === 'bar'
              && key.market === 'CN' && key.assetType === 'STOCK' && key.timeframe === '1d' && key.adjustment === 'none')],
            rules: [{ scope: { category: 'market' }, providers: ['akshare'] },
              ...baseline.config.rules.filter((rule) => rule.scope.category !== 'market')], preserved: [] } } });
        }
        if (fixture === 'single' && path === '/api/market-data/routes/capabilities') {
          const response = await route.fetch(), catalog = await response.json();
          return route.fulfill({ json: { ...catalog, entries: catalog.entries.filter((entry) => entry.key.kind === 'bar'
            && entry.key.market === 'CN' && entry.key.assetType === 'STOCK' && entry.key.timeframe === '1d'
            && entry.key.adjustment === 'none' && entry.target.providerId === 'akshare'
            && ['sina', 'eastmoney'].includes(entry.target.upstreamSource))
            .map((entry) => ({ ...entry, recommendation: { upstreamGroup: entry.target.upstreamSource, reason: '受控同等条件' } })) } });
        }
        return route.continue();
      });
      try {
        await page.goto(origin + '/market-data');
        const category = page.locator('section[aria-label="行情与净值"]');
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await category.getByRole('button', { name: '查看推荐理由', exact: true }).click();
        assert.equal(await category.getByRole('button', { name: /^待选择/ }).count(), 0);
        assert.equal(await category.getByText('推荐候选条件相同，保留现有已选来源', { exact: true }).count(), 3);
        await page.screenshot({ path: `${output}/existing-${width}.png` });
        fixture = 'pending';
        await page.reload();
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await category.getByRole('button', { name: '查看推荐理由', exact: true }).click();
        const expected = await category.locator('li').evaluateAll((nodes) => nodes
          .filter((node) => node.textContent.includes('请选择具体来源'))
          .map((node) => node.querySelector('span').textContent.replace(/^行情与净值 · /, '')));
        assert(expected.length > 0);
        const pending = category.getByRole('button', { name: `待选择 ${expected.length} 项`, exact: true });
        await pending.click();
        const dialog = page.getByRole('dialog');
        await dialog.getByText(`显示 ${expected.length} 项配置`, { exact: true }).waitFor();
        assert.deepEqual((await labels(dialog)).sort(), [...expected].sort());
        await dialog.getByRole('combobox', { name: '标的类型', exact: true }).click();
        await page.getByRole('option', { name: 'ETF', exact: true }).click();
        assert((await labels(dialog)).every((label) => label.includes(' · ETF · ')));
        await dialog.getByRole('button', { name: '清空筛选', exact: true }).click();
        assert.equal(await rows(dialog).count(), expected.length);
        assert(await dialog.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
        const rect = await dialog.boundingBox();
        assert(rect.x >= -1 && rect.x + rect.width <= width + 1);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        await page.screenshot({ path: `${output}/pending-${width}.png` });
        await page.keyboard.press('Escape');
        await dialog.waitFor({ state: 'hidden' });
        await category.getByRole('button', { name: /细分配置/ }).click();
        assert(await rows(dialog).count() > expected.length);
        await dialog.getByRole('button', { name: '返回主配置', exact: true }).click();

        fixture = 'single';
        await page.reload();
        await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
        await category.getByRole('button', { name: '待选择 1 项', exact: true }).click();
        assert.equal(await rows(dialog).count(), 1);
        await rows(dialog).getByRole('combobox', { name: '主数据源', exact: true }).click();
        await page.getByRole('option', { name: 'AKShare · 新浪财经', exact: true }).click();
        await dialog.getByText('显示 0 项配置', { exact: true }).waitFor();
        assert.equal(await rows(dialog).count(), 0);
        await dialog.getByRole('button', { name: '返回主配置', exact: true }).click();
        assert.equal(await category.getByRole('button', { name: /^待选择/ }).count(), 0);
        await category.getByRole('button', { name: /细分配置/ }).click();
        assert.equal(await rows(dialog).count(), 1);
        assert((await rows(dialog).getByRole('combobox', { name: '主数据源', exact: true }).textContent()).includes('AKShare · 新浪财经'));
        assert.deepEqual(errors, []);
        assert.deepEqual(writes, []);
        const result = { width, pendingCount: expected.length, exactScopesOnly: true, filters: true,
          existingSelectionsReady: true, clearWithinPending: true, normalEntryFullRange: true,
          resolutionUpdatesList: true, dialogBounds: true, realWrites: 0 };
        results.push(result);
        console.log(JSON.stringify(result));
      } finally { await page.unrouteAll({ behavior: 'ignoreErrors' }); await page.close(); }
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
