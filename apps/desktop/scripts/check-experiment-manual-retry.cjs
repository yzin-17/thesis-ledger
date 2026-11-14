const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const fixture = require('../test/fixtures/experiment-risk-ui-recovery.json');
const output = process.env.EXPERIMENT_RETRY_QA_OUTPUT || '/tmp/experiment-manual-retry-qa';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      let phase = 'failed',
        detailReads = 0;
      const writes = [],
        unexpected = [],
        errors = [];
      const experiment = () => {
        let status = 'succeeded',
          stage = 'completed';
        if (phase === 'failed' || phase === 'failed-empty') {
          status = 'failed';
          stage = 'failed';
        } else if (phase === 'running') {
          status = 'running';
          stage = 'proposing';
        } else if (phase === 'cancelled') {
          status = 'cancelled';
          stage = 'cancelled';
        }
        return {
          ...fixture.experiment,
          name: '原实验失败重试验收',
          status,
          stage,
          executionAttempt: phase === 'failed' ? 7 : 9,
          lockedCandidateIds: [],
          stopReason: phase === 'failed' ? 'model_generation_failed' : null,
        };
      };
      const detail = () => ({
        experiment: experiment(),
        candidates: [],
        attempts: [],
      });
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          url = new URL(request.url());
        if (request.method() !== 'GET') {
          if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/retry`)) {
            const body = request.postDataJSON();
            writes.push(body);
            assert.equal(body.expectedExecutionAttempt, 7);
            assert(body.idempotencyKey);
            assert.deepEqual(Object.keys(body).sort(), [
              'expectedExecutionAttempt',
              'idempotencyKey',
            ]);
            if (writes.length === 1)
              return route.fulfill({
                status: 503,
                json: { message: '受控重试失败' },
              });
            await new Promise((resolve) => setTimeout(resolve, 700));
            phase = 'running';
            return route.fulfill({ json: experiment() });
          }
          unexpected.push(request.method() + ' ' + url.pathname);
          return route.abort();
        }
        if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}/compare`))
          return route.fulfill({
            json: {
              ...detail(),
              baseline: { runRefs: {}, metrics: {} },
              note: '受控原地重试',
            },
          });
        if (url.pathname.endsWith(`/experiments/${fixture.experiment.id}`)) {
          if (phase === 'running' && ++detailReads > 1) phase = 'completed';
          return route.fulfill({ json: detail() });
        }
        return route.continue();
      });
      await page.goto(`http://localhost:5173/strategy/experiments/${fixture.experiment.id}`);
      const retry = page.getByRole('button', { name: '失败重试', exact: true });
      await retry.waitFor();
      const colors = await retry.evaluate(button => {
        const probe = document.createElement('span'); probe.className = 'text-foreground';
        button.parentElement.append(probe);
        const expected = getComputedStyle(probe).color, actual = getComputedStyle(button).color;
        const border = getComputedStyle(button).borderTopWidth;
        probe.remove(); return { expected, actual, border };
      });
      assert.equal(colors.actual, colors.expected, '失败重试使用正文色');
      assert(parseFloat(colors.border) > 0, '未悬停时仍有可见边框');
      await retry.focus();
      assert(await retry.evaluate(button => document.activeElement === button));
      assert(
        await page
          .getByText('保留历史和累计用量，按原配置重新请求模型。', {
            exact: true,
          })
          .isVisible(),
      );
      await page.screenshot({
        path: path.join(output, `failed-${width}.png`),
        fullPage: true,
      });
      await retry.click();
      await page.getByText('实验重试失败', { exact: true }).waitFor();
      assert.equal(writes.length, 1);
      assert(await retry.isEnabled());
      await retry.click();
      const pending = page.getByRole('button', {
        name: '正在重试',
        exact: true,
      });
      await pending.waitFor();
      assert(await pending.isDisabled());
      await page.getByText('已完成', { exact: true }).first().waitFor();
      assert.equal(writes.length, 2);
      assert.deepEqual(writes[0], writes[1]);
      assert(page.url().endsWith(`/experiments/${fixture.experiment.id}`));
      assert.equal(await page.getByRole('button', { name: '失败重试', exact: true }).count(), 0);
      assert.deepEqual(unexpected, []);
      assert.deepEqual(errors, []);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      phase = 'cancelled';
      await page.reload();
      await page.getByText('已取消', { exact: true }).first().waitFor();
      assert.equal(await page.getByRole('button', { name: '失败重试', exact: true }).count(), 0);
      phase = 'failed-empty';
      await page.reload();
      await page.getByRole('button', { name: '失败重试', exact: true }).waitFor();
      assert(await page.getByText('实验执行失败', { exact: true }).isVisible());
      results.push({
        width,
        originalId: true,
        responseFailureRetained: true,
        sameRequestReused: true,
        pendingDisabled: true,
        neutralButton: true,
        automaticPolling: true,
        liveWrites: 0,
        pageOverflow: false,
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
