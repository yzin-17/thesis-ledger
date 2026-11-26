const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.EXPERIMENT_SETTINGS_QA_URL || 'http://localhost:5173';
const output = process.env.EXPERIMENT_SETTINGS_QA_OUTPUT || '/tmp/experiment-settings-qa';
const liveOnly = process.argv.includes('--live-readonly');
fs.mkdirSync(output, { recursive: true });

const blocked = (requestId) => ({
  contractVersion: 1,
  requestId,
  checkedAt: new Date().toISOString(),
  scope: 'baseline-window',
  status: 'blocked',
  diagnostics: [
    {
      severity: 'error',
      category: 'data-unavailable',
      code: 'DATA_UNAVAILABLE',
      message: '受控行情准备失败，输入已保留',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: [],
      incompatibleRules: [],
      targetSources: [],
      suggestedActions: [{ action: 'retry-preflight', description: '恢复行情后重试' }],
    },
  ],
});
async function geometry(page) {
  const result = await page.evaluate(() => ({
    width: innerWidth,
    overflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
    controls: [...document.querySelectorAll('input,button,textarea')]
      .filter(
        (el) =>
          el.getClientRects().length &&
          el.getBoundingClientRect().width > 1 &&
          el.getBoundingClientRect().height > 1,
      )
      .every((el) => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.right <= innerWidth + 1;
      }),
  }));
  if (!result.controls) {
    console.error(
      await page.locator('input,button,textarea').evaluateAll((elements) =>
        elements
          .filter(
            (el) =>
              el.getClientRects().length &&
              el.getBoundingClientRect().width > 1 &&
              el.getBoundingClientRect().height > 1,
          )
          .map((el) => ({
            text: el.getAttribute('aria-label') || el.textContent?.slice(0, 60),
            left: el.getBoundingClientRect().left,
            right: el.getBoundingClientRect().right,
          }))
          .filter((el) => el.left < 0 || el.right > innerWidth + 1)
          .slice(0, 10),
      ),
    );
    await page.screenshot({ path: `${output}/overflow-${result.width}.png`, fullPage: true });
  }
  assert.equal(result.overflow, 0);
  assert.equal(result.controls, true);
  return result;
}
async function controlled(browser, width) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [],
    requests = [];
  page.setDefaultTimeout(10000);
  let failNext = true;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (path.endsWith('/strategy-optimization/run-config/execution-model')) {
      const body = request.postDataJSON();
      requests.push({ kind: 'settings', body });
      if (failNext) {
        failNext = false;
        return route.fulfill({ status: 503, json: { message: '受控设置暂不可用' } });
      }
      const model = await page.evaluate(() => structuredClone(window.experimentSettingsQa.model));
      model.scope.range = { start: body.startDate, end: body.endDate };
      for (const segment of model.segments) segment.range = model.scope.range;
      return route.fulfill({
        json: {
          status: 'available',
          policy: 'research-defaults',
          notes: [
            body.target.sourceMode === 'discovery'
              ? '从零探索按零佣金、零滑点起步。'
              : '佣金、最低佣金和滑点沿用策略。',
          ],
          model,
        },
      });
    }
    if (path.endsWith('/strategy-optimization/run-config/prepare')) {
      const body = request.postDataJSON();
      requests.push({ kind: 'prepare', body });
      return route.fulfill({ json: blocked(body.intent.requestId) });
    }
    throw Error(`未预期的请求：${request.method()} ${path}`);
  });
  await page.goto(base + '/test/browser-experiment-settings.html');
  await page.getByText('模拟成交设置暂不可用', { exact: true }).waitFor();
  const prepare = page.getByRole('button', { name: '准备实验配置', exact: true });
  assert.equal(await prepare.isDisabled(), true);
  await page.getByRole('button', { name: '重新准备成交设置', exact: true }).click();
  await page.getByText('研究默认规则 · 已自动配置', { exact: true }).waitFor();
  assert.equal(await page.locator('textarea').count(), 0);
  assert.equal(await prepare.isEnabled(), true);
  await prepare.click();
  await page
    .getByText(/受控行情准备失败，输入已保留/)
    .waitFor()
    .catch(async (error) => {
      fs.writeFileSync(
        `${output}/failure.json`,
        JSON.stringify({ errors, requests, text: await page.locator('body').innerText() }, null, 2),
      );
      throw error;
    });
  assert.equal(requests.at(-1).body.intent.accountingBasis, 'normalized-series');
  assert.equal(requests.at(-1).body.intent.freezeTimePolicy, 'after-acquisition');
  assert.equal(requests.at(-1).body.intent.history.basis, 'fixed-provider-snapshot');
  assert.equal(requests.at(-1).body.intent.adjustment, 'hfq');
  assert.equal(requests.at(-1).body.intent.priceResearch, 'price-research-v1');
  assert.equal(requests.at(-1).body.intent.priceResearchReference, 'freeze');
  assert.equal(await page.getByRole('button', { name: '前复权', exact: true }).count(), 0);
  await page.getByText('策略收益研究', { exact: true }).waitFor();
  await page.getByRole('button', { name: '切换探索样本', exact: true }).click();
  await page.getByText('从零探索按零佣金、零滑点起步。', { exact: true }).waitFor();
  const refreshed = page.waitForResponse(
    (response) =>
      response.url().endsWith('/run-config/execution-model') &&
      response.request().postDataJSON().startDate === '2024-02-01',
  );
  await page.getByRole('button', { name: '切换区间样本', exact: true }).click();
  await refreshed;
  await prepare.click();
  await page.getByText(/受控行情准备失败，输入已保留/).waitFor();
  assert.equal(
    requests.at(-1).body.intent.runConfig.executionModel.scope.range.start,
    '2024-02-01',
  );
  const dimensions = await geometry(page);
  await prepare.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/controlled-${width}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await page.close();
  return {
    width,
    ...dimensions,
    failedSettingsRetried: true,
    jsonRemoved: true,
    preparationFailurePreservesInput: true,
    frozenResearchProtocolVerified: true,
    targetAndPeriodRefreshed: true,
  };
}
async function live(browser, width, version) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  const errors = [],
    writes = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!path.startsWith('/api/')) return route.continue();
    if (request.method() === 'GET' || path.endsWith('/run-config/execution-model'))
      return route.continue();
    writes.push(`${request.method()} ${path}`);
    return route.abort();
  });
  await page.goto(base + '/strategy/experiments/new?strategyVersionId=' + version.id);
  await page
    .getByText('允许 AI 修改的参数', { exact: true })
    .locator('..')
    .getByRole('button')
    .first()
    .waitFor();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page
    .getByText(/已选择 .*个模型/)
    .waitFor()
    .catch(async (error) => {
      fs.writeFileSync(`${output}/live-failure.txt`, await page.locator('body').innerText());
      throw error;
    });
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('研究默认规则 · 已自动配置', { exact: true }).waitFor();
  assert.equal(await page.locator('textarea[aria-label="执行模型配置"]').count(), 0);
  assert.equal(
    await page.getByRole('button', { name: '准备实验配置', exact: true }).isEnabled(),
    true,
  );
  await page.getByText('策略收益研究', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '前复权', exact: true }).count(), 0);
  const dimensions = await geometry(page);
  await page.getByText('模拟成交设置', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/live-${width}.png`, fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await page.close();
  return { width, ...dimensions, automaticSettingsAvailable: true, writes };
}
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const results = [];
    let version;
    if (liveOnly) {
      const context = await browser.newContext();
      const strategies = await (
        await context.request.get(base + '/api/v1/backtests/strategies')
      ).json();
      const versions = strategies
        .flatMap((strategy) => strategy.versions)
        .filter(
          (v) =>
            v.schemaVersion === 3 &&
            v.version > 0 &&
            v.schema?.executionInstrument?.market === 'CN' &&
            v.schema?.executionInstrument?.assetType === 'stock',
        );
      for (const candidate of versions) {
        const response = await context.request.get(
          `${base}/api/v1/strategy-optimization/strategies/${candidate.id}/parameters`,
        );
        if (
          response.ok() &&
          (await response.json()).some((parameter) => parameter.optimizationRange)
        ) {
          version = candidate;
          break;
        }
      }
      assert.ok(version, '需要已有境内股票策略供只读验收');
      await context.close();
    }
    for (const width of [1440, 1024, 768, 390])
      results.push(await (liveOnly ? live(browser, width, version) : controlled(browser, width)));
    fs.writeFileSync(
      `${output}/${liveOnly ? 'live' : 'controlled'}-results.json`,
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
