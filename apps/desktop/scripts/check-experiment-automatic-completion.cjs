const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../test/fixtures/experiment-risk-ui-recovery.json');
const base = process.env.EXPERIMENT_AUTOMATIC_QA_URL || 'http://localhost:5173';
const output = process.env.EXPERIMENT_AUTOMATIC_QA_OUTPUT || '/tmp/experiment-automatic-qa';
fs.mkdirSync(output, { recursive: true });
const restricted = {
  state: 'restricted',
  code: 'TEST_NOT_REVEALED',
  scope: 'test',
  accessedAt: null,
  revealedAt: null,
};
const ids = Array.from({ length: 4 }, (_, i) => `00000000-0000-4000-8000-00000000010${i}`);

(async () => {
  const strategy = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../../packages/schemas/fixtures/backtest-v2.exchange.json'),
      'utf8',
    ),
  );
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      const errors = [],
        unexpectedWrites = [],
        controlled = [];
      let phase = 'preparing',
        reads = 0;
      const experiment = () => ({
        ...fixture.experiment,
        name: '实验自动完成验收',
        selectedCandidateId: null,
        lockedCandidateIds: phase === 'preparing' ? [] : ids,
        status: phase === 'completed' ? 'succeeded' : 'awaiting_finalization',
        stage: phase === 'completed' ? 'completed' : 'awaiting_finalization',
        stopReason: phase === 'retry' ? 'final_test_retry_required:受控中断' : null,
        exposure: { testRevealed: phase === 'completed', preselectedCandidateId: null },
        readEligibility: phase === 'completed' ? fixture.experiment.readEligibility : restricted,
      });
      const candidates = () =>
        ids.map((id, i) => ({
          ...fixture.candidate,
          id,
          candidateNumber: i + 1,
          validationStatus: phase === 'completed' ? 'test_valid' : 'restricted',
          readEligibility: phase === 'completed' ? fixture.candidate.readEligibility : restricted,
          metrics: {
            development: { status: 'valid', tradeCount: 4 },
            validation: {
              status: 'valid',
              tradeCount: 3,
              totalReturn: '0.01',
              maxDrawdown: '-0.02',
            },
            ...(phase === 'completed'
              ? {
                  test: {
                    status: 'valid',
                    tradeCount: 2,
                    totalReturn: '0.03',
                    maxDrawdown: '-0.01',
                  },
                }
              : {}),
          },
        }));
      const comparison = () => ({
        experiment: experiment(),
        candidates: candidates(),
        attempts: [],
        note: '受控自动完成',
        baseline: {
          runRefs: {},
          metrics: phase === 'completed' ? { test: { totalReturn: '0.02' } } : {},
        },
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (request.method() !== 'GET') {
          if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/complete`)) {
            controlled.push({ action: 'complete', body: request.postDataJSON() });
            phase = 'completed';
            return route.fulfill({ json: comparison() });
          }
          if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/adopt`)) {
            controlled.push({ action: 'adopt', body: request.postDataJSON() });
            return route.fulfill({ status: 503, json: { message: '受控采纳失败' } });
          }
          unexpectedWrites.push(`${request.method()} ${url.pathname}`);
          return route.abort();
        }
        if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/adopt-context`)) {
          const candidateId = url.searchParams.get('candidateId');
          const version = {
            id: fixture.experiment.baselineStrategyVersionId,
            strategyId: fixture.experiment.baselineStrategyVersionId,
            version: 1,
            schemaVersion: Number(strategy.schemaVersion),
            schema: strategy,
          };
          return route.fulfill({
            json: {
              experimentId: fixture.experiment.id,
              candidateId,
              expectedStrategyVersion: 1,
              baseline: version,
              current: version,
              candidate: {
                ...version,
                id: fixture.candidate.candidateStrategyVersionId,
                candidateId,
                executionHash: fixture.candidate.executionHash,
              },
              candidateVsBaseline: [],
              candidateVsCurrent: [],
            },
          });
        }
        if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/compare`))
          return route.fulfill({ json: comparison() });
        if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}`)) {
          if (++reads > 1 && phase === 'preparing') phase = 'completed';
          return route.fulfill({
            json: { experiment: experiment(), candidates: candidates(), attempts: [] },
          });
        }
        return route.continue();
      });
      await page.goto(`${base}/strategy/experiments/${fixture.experiment.id}`);
      await page.getByText('准备测试', { exact: true }).waitFor();
      assert.equal(
        await page.getByRole('button', { name: /进入测试|预选采纳|锁定并运行/ }).count(),
        0,
      );
      await page.getByText('已完成', { exact: true }).first().waitFor();
      assert(reads > 1, '必须自动轮询到终态');
      assert.equal(controlled.length, 0, '页面读取不能发起测试或采纳');
      assert.equal(await page.getByRole('button', { name: '审阅并采纳', exact: true }).count(), 4);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: path.join(output, `completed-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: '审阅并采纳', exact: true }).first().click();
      await page.getByText('确认采纳候选', { exact: true }).waitFor();
      await page.getByRole('button', { name: '返回候选', exact: true }).click();
      assert.equal(controlled.length, 0);
      await page.getByRole('button', { name: '审阅并采纳', exact: true }).first().click();
      await page.getByRole('button', { name: '确认采纳', exact: true }).click();
      await page.getByText('采纳失败', { exact: true }).waitFor();
      assert.equal(controlled[0].action, 'adopt');
      assert.equal(controlled[0].body.candidateId, ids[0]);
      assert.equal(controlled[0].body.acknowledgeTestExposure, true);
      await page.getByRole('button', { name: '返回候选', exact: true }).click();
      phase = 'retry';
      await page.reload();
      const retry = page.getByRole('button', { name: '重试未完成测试', exact: true });
      await retry.waitFor();
      assert.equal(
        await page.getByRole('button', { name: /进入测试|预选采纳|锁定并运行/ }).count(),
        0,
      );
      await retry.click();
      await page.getByText('已完成', { exact: true }).first().waitFor();
      assert.deepEqual(controlled[1], { action: 'complete', body: {} });
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpectedWrites, []);
      results.push({
        width,
        automaticPolling: true,
        resultCandidates: 4,
        choiceControls: 0,
        humanAdoptionOnly: true,
        retryByExperiment: true,
        pageOverflow: false,
        liveWrites: 0,
      });
      await page.close();
    }
    fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
