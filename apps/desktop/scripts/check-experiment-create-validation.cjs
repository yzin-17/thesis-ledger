const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '../../..');
const base = process.env.EXPERIMENT_CREATE_QA_URL || 'http://localhost:5173';
const output = process.env.EXPERIMENT_CREATE_QA_OUTPUT || '/tmp/experiment-create-validation-qa';
fs.mkdirSync(output, { recursive: true });
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'packages/schemas/fixtures/backtest-snapshot-v3.manifest.json')),
);
const fixture = JSON.parse(
  fs.readFileSync(path.join(root, 'apps/desktop/test/fixtures/experiment-risk-ui-recovery.json')),
);

async function run(browser, width, version, schemas) {
  const page = await browser.newPage({
    viewport: { width, height: 1000 },
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(15000);
  const errors = [],
    unexpected = [],
    bodies = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/')) return route.continue();
    if (pathname.endsWith('/run-config/prepare')) {
      const body = request.postDataJSON(),
        intent = body.intent;
      assert.equal(intent.adjustment, 'hfq');
      assert.equal(intent.priceResearch, 'price-research-v1');
      assert.equal(intent.priceResearchReference, 'freeze');
      const protocol = structuredClone(manifest.executionPriceProtocol);
      protocol.history = intent.history;
      protocol.priceBasis.adjustment = intent.adjustment;
      protocol.priceBasis.observedAt = intent.runConfig.dataAsOf;
      const actualSource = structuredClone(
        manifest.actualSources.find((source) => source.purpose === 'execution'),
      );
      actualSource.symbol = intent.runConfig.executionModel.scope.symbol;
      actualSource.routeKey.adjustment = intent.adjustment;
      actualSource.routeKey.assetType = intent.runConfig.executionModel.scope.instrumentType;
      actualSource.provenance = { ...actualSource.provenance, providerId: 'futu', upstreamSource: 'futu', routeIndex: 0 };
      const actualPriceSource = structuredClone(actualSource);
      actualPriceSource.routeKey.adjustment = 'none';
      actualPriceSource.provenance = { ...actualPriceSource.provenance, providerId: 'hithink', upstreamSource: 'hithink-financial-api', routeIndex: 1 };
      const prepared = {
        contractVersion: 1,
        requestId: intent.requestId,
        checkedAt: new Date().toISOString(),
        scope: 'baseline-window',
        status: 'prepared',
        runConfig: {
          ...intent.runConfig,
          schemaVersion: '3',
          priceResearch: {
            protocolVersion: 'price-research-v1',
            actualPriceWindow: {
              version: 'market-frozen-window-v1',
              identityFingerprint: 'a'.repeat(64),
              responseHash: 'b'.repeat(64),
            },
          },
          executionPriceProtocol: protocol,
          priceInputBindings: {
            signals: [{ sourceId: 'execution', binding: 'execution-series' }],
            benchmark: { binding: 'execution-series' },
          },
        },
        strategyContentHash: 'a'.repeat(64),
        actualSource,
        actualPriceSource,
        routeRevisions: { desiredRevision: 1, effectiveRevision: 1, catalogRevision: 1 },
      };
      schemas.optimizationRunPreparationResultSchema.parse(prepared);
      return route.fulfill({ json: prepared });
    }
    if (pathname.endsWith('/strategy-optimization/experiments') && request.method() === 'POST') {
      const body = request.postDataJSON();
      schemas.optimizationExperimentCreateSchema.parse(body);
      bodies.push(body);
      if (bodies.length === 1)
        return route.fulfill({ status: 503, json: { message: '受控创建失败' } });
      return route.fulfill({
        json: schemas.optimizationExperimentReadSchema.parse(fixture.experiment),
      });
    }
    if (request.method() === 'GET') {
      if (pathname.endsWith('/experiments/' + fixture.experiment.id))
        return route.fulfill({
          json: { experiment: fixture.experiment, candidates: [fixture.candidate], attempts: [] },
        });
      if (pathname.endsWith('/experiments/' + fixture.experiment.id + '/compare'))
        return route.fulfill({
          json: {
            experiment: fixture.experiment,
            baseline: { metrics: {}, runRefs: {} },
            candidates: [fixture.candidate],
          },
        });
      return route.continue();
    }
    if (pathname.endsWith('/run-config/execution-model')) return route.continue();
    unexpected.push(`${request.method()} ${pathname}`);
    return route.abort();
  });
  await page.goto(`${base}/strategy/experiments/new?strategyVersionId=${version.id}`);
  await page
    .getByText('允许 AI 修改的参数', { exact: true })
    .locator('..')
    .getByRole('button')
    .first()
    .waitFor();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText(/已选择 .*个模型/).waitFor();
  await page.getByRole('button', { name: '下一步', exact: true }).click();
  await page.getByText('研究默认规则 · 已自动配置', { exact: true }).waitFor();
  assert.equal(await page.getByRole('group', { name: '实验价格口径', exact: true }).count(), 0);
  await page
    .getByText('后复权计算指标与模拟收益；具体价格条件使用不复权参考价。', { exact: true })
    .waitFor();
  await page.getByRole('button', { name: '准备实验配置', exact: true }).click();
  await page.getByText('实验配置已准备', { exact: true }).waitFor();
  await page.getByText('后复权来源：futu / futu · 主源', { exact: true }).waitFor();
  await page.getByText('不复权来源：hithink / hithink-financial-api · 备用源', { exact: true }).waitFor();
  const preparedCard = page.getByRole('alert').filter({ hasText: '实验配置已准备' });
  await preparedCard.scrollIntoViewIfNeeded();
  await preparedCard.screenshot({ path: `${output}/prepared-sources-${width}.png` });
  const create = page.getByRole('button', { name: '创建实验', exact: true });
  const values = [
    ['回测次数上限', '200', '0'],
    ['输入 Token 上限', '100000000', '10000000'],
    ['输出 Token 上限', '20000000', '2000000'],
    ['时长上限（秒）', '180000', '86400'],
  ];
  for (const [label, value] of values)
    await page.getByRole('spinbutton', { name: label, exact: true }).fill(value);
  await create.click();
  await page.getByRole('alert').filter({ hasText: '回测次数上限填 0 表示不限制' }).waitFor();
  assert.equal(bodies.length, 0);
  for (const [label, value] of values)
    assert.equal(
      await page.getByRole('spinbutton', { name: label, exact: true }).inputValue(),
      value,
    );
  const intent = await page.locator('dd').last().innerText();
  const overflow = await page.evaluate(() =>
    Math.max(0, document.documentElement.scrollWidth - innerWidth),
  );
  assert.equal(overflow, 0);
  await page
    .getByRole('spinbutton', { name: '回测次数上限', exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${output}/invalid-${width}.png`, fullPage: true });
  for (const [label, , value] of values)
    await page.getByRole('spinbutton', { name: label, exact: true }).fill(value);
  const backtestBudget = page.getByRole('spinbutton', { name: '回测次数上限', exact: true });
  await backtestBudget.fill('');
  await create.click();
  await page.getByRole('alert').filter({ hasText: '请填写回测次数上限' }).waitFor();
  assert.equal(bodies.length, 0);
  await backtestBudget.fill('0');
  assert.equal(await page.getByRole('alert').filter({ hasText: '请填写回测次数上限' }).count(), 0);
  const aiBudget = page.getByRole('spinbutton', { name: 'AI 调用上限', exact: true });
  assert.equal(await aiBudget.getAttribute('min'), '0');
  await aiBudget.fill('');
  await create.click();
  await page.getByRole('alert').filter({ hasText: '请填写 AI 调用上限' }).waitFor();
  assert.equal(bodies.length, 0);
  await aiBudget.fill('0');
  assert.equal(await page.getByRole('alert').filter({ hasText: '请填写 AI 调用上限' }).count(), 0);
  for (const label of ['输入 Token 上限', '输出 Token 上限']) {
    const input = page.getByRole('spinbutton', { name: label, exact: true });
    assert.equal(await input.getAttribute('min'), '0');
    await input.fill('');
    await create.click();
    await page
      .getByRole('alert')
      .filter({ hasText: `请填写${label}` })
      .waitFor();
    assert.equal(bodies.length, 0);
    await input.fill('0');
    assert.equal(
      await page
        .getByRole('alert')
        .filter({ hasText: `请填写${label}` })
        .count(),
      0,
    );
  }
  await page.screenshot({ path: `${output}/unlimited-${width}.png`, fullPage: true });
  await create.click();
  await page.getByRole('alert').filter({ hasText: '服务暂时无法完成本次操作' }).waitFor();
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].budget.maxBacktestRuns, 0);
  assert.equal(bodies[0].budget.maxAiCalls, 0);
  assert.equal(bodies[0].budget.maxInputTokens, 0);
  assert.equal(bodies[0].budget.maxOutputTokens, 0);
  assert.equal(bodies[0].idempotencyKey, intent);
  await create.click();
  await page.waitForURL(`**/strategy/experiments/${fixture.experiment.id}`);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies[0], bodies[1]);
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  await page.close();
  return {
    width,
    overflow,
    invalidBudgetBlocked: true,
    inputRetained: true,
    correctedRequestValidated: true,
    unlimitedBacktestBudget: true,
    unlimitedAiCallBudget: true,
    unlimitedTokenBudget: true,
    bothFrozenSourcesShown: true,
    emptyBudgetBlocked: true,
    sameIntentOnRetry: true,
    successNavigated: true,
    realCreations: 0,
  };
}
(async () => {
  const schemas = await import(pathToFileURL(path.join(root, 'packages/schemas/dist/index.js')));
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const context = await browser.newContext();
    const strategies = await (
      await context.request.get(base + '/api/v1/backtests/strategies')
    ).json();
    const versions = strategies
      .flatMap((strategy) => strategy.versions)
      .filter(
        (version) =>
          version.version > 0 &&
          version.schema?.schemaVersion === '3' &&
          version.schema.executionInstrument?.market === 'CN',
      );
    let version;
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
    assert.ok(version, '需要既有受控策略供只读页面验收');
    await context.close();
    const results = [];
    for (const width of [1440, 1024, 768, 390])
      results.push(await run(browser, width, version, schemas));
    fs.writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
