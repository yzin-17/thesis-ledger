const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');

const output = process.env.DIAGNOSTICS_QA_OUTPUT || '/tmp/provider-diagnostics-qa';
const baseUrl = process.env.DIAGNOSTICS_QA_BASE_URL || 'http://127.0.0.1:5192';
const jobId = '00000000-0000-4000-8000-000000000001';
const emptyPage = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.DIAGNOSTICS_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1100 },
        reducedMotion: 'reduce',
      });
      let mode = 'records';
      const pending = [],
        requests = [],
        writes = [],
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // 全部业务请求在浏览器内受控，真实账户、来源与通知均不会被访问。
      await page.route('**/api/v1/**', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        requests.push(url.pathname + url.search);
        if (request.method() !== 'GET') {
          writes.push(request.method() + ' ' + url.pathname);
          return route.abort();
        }
        const diagnostic = [
          '/api/v1/providers/health/issues',
          '/api/v1/automations/issues',
        ].includes(url.pathname);
        if (url.pathname.endsWith('/data-quality/issues')) {
          return route.fulfill({
            json:
              mode === 'quality'
                ? [
                    {
                      id: 'controlled-quality',
                      provider: 'dsa',
                      symbol: '600519.SH',
                      capability: 'REALTIME_QUOTE',
                      severity: 'error',
                      code: 'response_schema_invalid',
                      status: 'open',
                      detectedAt: '2026-11-09T01:00:00Z',
                      details: {
                        occurrences: 3,
                        firstSeenAt: '2026-11-09T01:00:00Z',
                        lastSeenAt: '2026-11-09T02:00:00Z',
                        message: '来源返回的数据格式或数值未通过校验',
                      },
                    },
                  ]
                : [],
          });
        }
        if (diagnostic && mode === 'hold') await new Promise((resolve) => pending.push(resolve));
        if (diagnostic && mode === 'error')
          return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
        if (
          url.pathname.endsWith('/providers/health/history') ||
          url.pathname.endsWith('/providers/health/issues')
        ) {
          if (!diagnostic || mode === 'empty') return route.fulfill({ json: emptyPage });
          const current = Number(url.searchParams.get('page'));
          return route.fulfill({
            json: {
              page: current,
              pageSize: 20,
              total: 21,
              totalPages: 2,
              items: [
                {
                  provider: current === 1 ? '受控来源' : '较早异常来源',
                  state: mode === 'unfiltered' ? 'healthy' : 'degraded',
                  latencyMs: 4000,
                  checkedAt: '2026-11-09T01:00:00Z',
                  errorCode: current === 1 ? 'provider_first_output_timeout' : 'schema_mismatch',
                  source: 'scheduled',
                },
              ],
            },
          });
        }
        if (
          url.pathname.endsWith('/automations/history') ||
          url.pathname.endsWith('/automations/issues')
        ) {
          if (!diagnostic || mode === 'empty') return route.fulfill({ json: emptyPage });
          return route.fulfill({
            json: {
              ...emptyPage,
              total: 1,
              totalPages: 1,
              items: [
                {
                  id: '00000000-0000-4000-8000-000000000002',
                  jobId,
                  status: mode === 'unfiltered' ? 'succeeded' : 'unknown_outcome',
                  startedAt: '2026-11-09T01:00:00Z',
                  finishedAt: null,
                  attempt: 1,
                  traceId: 'controlled',
                  output: null,
                  error: '受控租约过期，结果待核对',
                },
              ],
            },
          });
        }
        if (url.pathname.endsWith('/automations'))
          return route.fulfill({
            json: [
              {
                id: jobId,
                name: '受控自动化任务',
                type: 'provider-health',
                cron: '0 9 * * 1-5',
                timezone: 'Asia/Shanghai',
                enabled: false,
                nextRunAt: null,
                managed: false,
              },
            ],
          });
        if (url.pathname.endsWith('/notifications')) {
          assert.equal(url.searchParams.get('status'), 'failed,retrying');
          return route.fulfill({
            json: [
              {
                id: 'notification',
                provider: '受控通知',
                status: 'retrying',
                lastError: 'timeout',
              },
            ],
          });
        }
        if (url.pathname.endsWith('/ai/settings'))
          return route.fulfill({
            json: { researchDefault: null, revision: 'controlled', candidates: [] },
          });
        return route.fulfill({ json: [] });
      });
      async function open() {
        await page.goto(`${baseUrl}/providers`);
        await page
          .locator('section.panel')
          .filter({ has: page.getByRole('heading', { name: '提供方', exact: true }) })
          .getByText('暂无记录', { exact: true })
          .waitFor();
        await page.getByRole('tab', { name: '诊断', exact: true }).click();
      }
      const section = (title) =>
        page
          .locator('section.panel')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      await open();
      await page.getByText('provider_first_output_timeout', { exact: true }).waitFor();
      await page.getByText('受控租约过期，结果待核对', { exact: true }).waitFor();
      assert((await section('自动化运行异常').textContent()).includes('结果待确认'));
      assert((await section('通知失败').textContent()).includes('重试中'));
      await section('来源检查异常').getByRole('button', { name: '下一页' }).click();
      await page.getByText('较早异常来源', { exact: true }).waitFor();
      assert((await section('来源检查异常').textContent()).includes('第 2 / 2 页'));
      assert((await section('自动化运行异常').textContent()).includes('第 1 / 1 页'));
      await section('来源检查异常').getByRole('button', { name: '上一页' }).click();
      await page.getByText('provider_first_output_timeout', { exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      const size = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert(size.content <= size.width + 1, `页面横向溢出：${JSON.stringify(size)}`);
      const refresh = page.getByRole('button', { name: '刷新数据与自动化', exact: true });
      mode = 'hold';
      await refresh.click();
      await section('来源检查异常')
        .locator('[data-slot="list-refresh-region"][aria-busy="true"]')
        .waitFor();
      assert(
        (await section('来源检查异常').textContent()).includes('provider_first_output_timeout'),
      );
      mode = 'records';
      pending.splice(0).forEach((resolve) => resolve());
      await page.waitForFunction(
        () => !document.querySelector('button[aria-label="刷新数据与自动化"]')?.disabled,
      );
      mode = 'error';
      await refresh.click();
      await page.getByText('来源检查异常更新失败', { exact: true }).waitFor();
      assert(
        (await section('来源检查异常').textContent()).includes('provider_first_output_timeout'),
      );
      assert((await section('自动化运行异常').textContent()).includes('受控租约过期'));
      await section('来源检查异常').getByRole('button', { name: '重新加载' }).click();
      await page.getByText('来源检查异常更新失败', { exact: true }).waitFor();
      await open();
      await page.getByText('暂无来源检查异常。', { exact: true }).waitFor({ state: 'hidden' });
      await page.getByText('来源检查异常读取失败', { exact: true }).waitFor();
      mode = 'unfiltered';
      await open();
      await page.getByText('来源检查异常读取失败', { exact: true }).waitFor();
      await page.getByText('自动化运行异常读取失败', { exact: true }).waitFor();
      assert(!(await section('来源检查异常').textContent()).includes('健康'));
      assert(!(await section('自动化运行异常').textContent()).includes('成功'));
      mode = 'empty';
      await open();
      await page.getByText('暂无来源检查异常。', { exact: true }).waitFor();
      await page.getByText('暂无自动化运行异常。', { exact: true }).waitFor();
      mode = 'quality';
      await open();
      const quality = section('未关闭的数据质量问题');
      await quality
        .getByText('数据格式异常：来源返回的数据格式或数值未通过校验', { exact: true })
        .waitFor();
      assert((await quality.textContent()).includes('600519.SH'));
      assert.equal(await quality.getByRole('cell', { name: '3', exact: true }).count(), 1);
      const latestTime = await page.evaluate(() =>
        new Date('2026-11-09T02:00:00Z').toLocaleString('zh-CN'),
      );
      await quality.getByRole('cell', { name: latestTime, exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${width}-quality.png`, fullPage: true });
      assert.equal(writes.length, 0, '诊断触发了写请求');
      assert.deepEqual(errors, [], '浏览器出现运行错误');
      results.push({ width, requests: requests.length, writes: writes.length, passed: true });
      await page.close();
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
