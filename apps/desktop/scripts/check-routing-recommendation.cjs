const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/routing-available-recommendation-qa';
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });

const snapshotCategories = (page) =>
  page.locator('section[aria-label]').evaluateAll((nodes) =>
    nodes
      .filter((node) => node.querySelector('h2') && node.querySelector('[role="combobox"]'))
      .map((node) => ({
        category: node.getAttribute('aria-label'),
        selections: [...node.querySelectorAll('[role="combobox"]')].map(
          (element) => element.textContent,
        ),
        badges: [...node.querySelectorAll('[data-slot="badge"]')].map(
          (element) => element.textContent,
        ),
        count: node.querySelector('h2')?.parentElement.querySelector('span')?.textContent,
      })),
  );

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const mode of ['configured', 'no-key']) {
        const page = await browser.newPage({
          viewport: { width, height: 1000 },
          reducedMotion: 'reduce',
        });
        page.setDefaultTimeout(15000);
        let baseline, submitted, preview, providers, catalog;
        const noKeyIds = new Set();
        const saves = [],
          writes = [],
          errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route(
          (url) => url.pathname.startsWith('/api/'),
          async (route) => {
            const request = route.request();
            const path = new URL(request.url()).pathname;
            if (path === '/api/market-data/providers' && request.method() === 'GET') {
              const response = await route.fetch();
              const registry = await response.json();
              providers = registry.providers;
              if (mode === 'no-key') {
                providers = providers.map((provider) => {
                  if (!provider.requiresCredential && !provider.credentialConfigured)
                    return provider;
                  noKeyIds.add(provider.providerId);
                  return { ...provider, configured: false, credentialConfigured: false };
                });
              }
              return route.fulfill({ json: { ...registry, providers } });
            }
            if (path === '/api/market-data/routes/capabilities' && request.method() === 'GET') {
              const response = await route.fetch();
              catalog = await response.json();
              // 模拟无 Key 部署时，目录中需要凭证的目标由配置清单同步降为不可用。
              if (mode === 'no-key') {
                const registryResponse = await page.request.get(
                  origin + '/api/market-data/providers',
                );
                const registry = await registryResponse.json();
                for (const provider of registry.providers)
                  if (provider.requiresCredential || provider.credentialConfigured)
                    noKeyIds.add(provider.providerId);
                catalog = {
                  ...catalog,
                  entries: catalog.entries.map((entry) =>
                    noKeyIds.has(entry.target.providerId)
                      ? { ...entry, state: 'credential_missing' }
                      : entry,
                  ),
                };
              }
              return route.fulfill({ json: catalog });
            }
            if (path === '/api/market-data/routing-config' && request.method() === 'GET') {
              const response = await route.fetch();
              baseline = await response.json();
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
              return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
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
          await category.getByRole('heading', { name: '行情与净值', exact: true }).waitFor();
          await category.getByText('按可用来源配置本类全部细分项', { exact: true }).waitFor();
          await page.waitForFunction(
            (element) => !element.matches(':disabled'),
            await category
              .getByRole('button', { name: '采用建议主备', exact: true })
              .elementHandle(),
          );
          const otherCategoriesBefore = (await snapshotCategories(page)).filter(
            (item) => item.category !== '行情与净值',
          );
          await category.getByRole('button', { name: '采用建议主备', exact: true }).click();
          await category.getByText('待保存', { exact: true }).waitFor();
          assert.deepEqual(
            (await snapshotCategories(page)).filter((item) => item.category !== '行情与净值'),
            otherCategoriesBefore,
          );
          assert.equal(await category.getByText(/^未覆盖/).count(), 0);
          await page.screenshot({ path: `${output}/main-${mode}-${width}.png` });
          await category.getByRole('button', { name: /细分配置/ }).click();
          const sheet = page.getByRole('dialog');
          await sheet.getByText('单独设置', { exact: true }).first().waitFor();
          assert.equal(await sheet.getByText('需选择精确来源', { exact: true }).count(), 0);
          await page.screenshot({ path: `${output}/children-${mode}-${width}.png` });
          await sheet.getByRole('button', { name: '保存配置', exact: true }).click();
          await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
          const rules = submitted.config.rules;
          const precise = rules.filter(
            (rule) => rule.scope.category === 'market' && rule.scope.market,
          );
          assert(precise.length > 0);
          assert.equal(
            precise.length,
            preview.diagnostics.filter((entry) => entry.inheritedFrom?.category === 'market')
              .length,
          );
          for (const rule of precise) {
            assert(rule.providers.length <= 2);
            assert.equal(new Set(rule.providers).size, rule.providers.length);
            for (const id of rule.providers) {
              const provider = providers.find((item) => item.providerId === id);
              assert(provider?.enabled && provider.configured);
              assert(!provider.requiresCredential || provider.credentialConfigured);
              assert(rule.upstreamSources[id]);
              if (mode === 'no-key') assert(!noKeyIds.has(id));
            }
          }
          assert.deepEqual(
            rules.filter((rule) => rule.scope.category !== 'market'),
            baseline.config.rules.filter((rule) => rule.scope.category !== 'market'),
          );
          assert.deepEqual(submitted.config.keys, baseline.config.keys);
          const marketDiagnostics = preview.diagnostics.filter(
            (entry) => entry.inheritedFrom?.category === 'market',
          );
          assert(marketDiagnostics.length > 0);
          assert(marketDiagnostics.every((entry) => entry.inheritedFrom.capability));
          assert(
            marketDiagnostics.every(
              (entry) =>
                entry.state === 'covered' ||
                entry.state === 'single_source' ||
                entry.state === 'uncovered',
            ),
          );
          for (const capability of [
            'REFERENCE_TICKS',
            'REFERENCE_ETF_TICKS',
            'REFERENCE_TDX_DAY_PACKAGE',
          ]) {
            const rule = precise.find((item) => item.scope.capability === capability);
            assert(rule?.providers.length > 0, capability + ' 应有免凭证兜底');
          }
          for (const rule of precise.filter(
            (item) => item.scope.market === 'US' && item.scope.assetType === 'INDEX',
          ))
            assert(rule.providers.includes('yfinance'));
          assert.equal(saves.length, 0);
          await page.getByRole('button', { name: '返回修改', exact: true }).click();
          await category.getByText(new RegExp(`${precise.length} 项单独配置`)).waitFor();
          assert.deepEqual(
            (await snapshotCategories(page)).filter((item) => item.category !== '行情与净值'),
            otherCategoriesBefore,
          );
          await page.getByRole('button', { name: '保存配置', exact: true }).click();
          await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
          await page.getByRole('button', { name: '确认保存', exact: true }).click();
          await page.getByRole('dialog').getByRole('alert').waitFor();
          await page.getByRole('button', { name: '确认保存', exact: true }).click();
          await page.waitForFunction(
            () =>
              ![...document.querySelectorAll('button')].some((el) =>
                el.textContent.includes('正在保存'),
              ),
          );
          assert.equal(saves.length, 2);
          assert.deepEqual(saves[0], saves[1]);
          await page.screenshot({ path: `${output}/preview-${mode}-${width}.png` });
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
          const result = {
            width,
            mode,
            states: marketDiagnostics.reduce((counts, entry) => {
              counts[entry.state] = (counts[entry.state] || 0) + 1;
              return counts;
            }, {}),
            changes: preview.changes.length,
            unchangedCategories: otherCategoriesBefore.length,
            controlledSaves: saves.length,
            realWrites: writes.length,
            errors,
          };
          results.push(result);
          console.log(JSON.stringify(result));
        } finally {
          await page.unrouteAll({ behavior: 'ignoreErrors' });
          await page.close();
        }
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
