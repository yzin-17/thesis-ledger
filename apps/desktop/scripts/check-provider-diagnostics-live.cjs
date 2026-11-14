const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');

const baseUrl = process.env.DIAGNOSTICS_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.DIAGNOSTICS_QA_OUTPUT || '/tmp/provider-diagnostics-live-qa';
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
      page.setDefaultTimeout(10000);
      console.log(`真实页面验收开始：${width}`);
      const writes = [],
        errors = [],
        responses = [],
        reads = [];
      page.on('pageerror', (error) => errors.push(error.message));
      // 真实服务只读验收，写请求直接拒绝，不触发重试或任务执行。
      await page.route('**/api/v1/**', (route) => {
        if (route.request().method() === 'GET') {
          reads.push(
            new URL(route.request().url()).pathname + new URL(route.request().url()).search,
          );
          return route.continue();
        }
        writes.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
        return route.abort();
      });
      page.on('response', async (response) => {
        const path = new URL(response.url()).pathname;
        if (!['/api/v1/providers/health/issues', '/api/v1/automations/issues'].includes(path))
          return;
        const body = await response.json();
        responses.push({ path, status: response.status(), body });
      });
      await page.goto(`${baseUrl}/providers`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('tab', { name: '诊断', exact: true }).click();
      console.log(`已进入诊断页：${width}`);
      const section = (title) =>
        page
          .locator('section.panel')
          .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
      const health = section('来源检查异常'),
        automation = section('自动化运行异常');
      await section('未关闭的数据质量问题').waitFor();
      await health.locator('tbody tr').first().waitFor();
      await automation.getByText('结果待确认', { exact: true }).waitFor();
      assert(!(await health.textContent()).includes('健康'));
      assert(!(await automation.textContent()).includes('成功'));
      const first = responses.find((item) => item.path.endsWith('/health/issues'));
      const runs = responses.find((item) => item.path.endsWith('/automations/issues'));
      assert(first && runs, '缺少真实异常接口响应');
      assert.equal(first.status, 200);
      assert.equal(runs.status, 200);
      assert(first.body.total > 0);
      await health
        .getByText(`第 1 / ${first.body.totalPages} 页，共 ${first.body.total} 条`, { exact: true })
        .waitFor();
      assert.equal(await health.locator('tbody tr').count(), first.body.items.length);
      const columnWidths = () =>
        health
          .locator('thead th')
          .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width));
      const firstWidths = await columnWidths();
      assert(first.body.items.every((item) => ['degraded', 'down'].includes(item.state)));
      assert(runs.body.items.every((item) => ['failed', 'unknown_outcome', 'partial', 'interrupted'].includes(item.status)));
      if (first.body.totalPages > 1) {
        const [next] = await Promise.all([
          page.waitForResponse((response) =>
            response.url().includes('/providers/health/issues?page=2'),
          ),
          health.getByRole('button', { name: '下一页' }).click(),
        ]).catch(async (error) => {
          console.log(
            JSON.stringify({
              reads: reads.slice(-12),
              footer: (await health.textContent()).slice(-140),
            }),
          );
          await page.screenshot({ path: `${output}/${width}-failure.png`, fullPage: true });
          throw error;
        });
        const nextBody = await next.json();
        assert.equal(nextBody.page, 2);
        assert.equal(nextBody.total, first.body.total);
        assert(nextBody.items.every((item) => ['degraded', 'down'].includes(item.state)));
        await health
          .getByText(`第 2 / ${first.body.totalPages} 页，共 ${first.body.total} 条`, {
            exact: true,
          })
          .waitFor();
        const secondWidths = await columnWidths();
        firstWidths.forEach((value, index) =>
          assert(Math.abs(value - secondWidths[index]) < 1, `第 ${index + 1} 列翻页后宽度改变`),
        );
        await page.screenshot({ path: `${output}/${width}-page2.png`, fullPage: true });
        await health.getByRole('button', { name: '上一页' }).click();
        await health
          .getByText(`第 1 / ${first.body.totalPages} 页，共 ${first.body.total} 条`, {
            exact: true,
          })
          .waitFor();
        console.log(`分页通过：${width}`);
      }
      const refreshed = page.waitForResponse((response) =>
        response.url().includes('/providers/health/issues?page=1'),
      );
      await page.getByRole('button', { name: '刷新数据与自动化', exact: true }).click();
      await refreshed;
      await page.waitForFunction(
        () => !document.querySelector('[data-slot="list-refresh-region"][aria-busy="true"]'),
      );
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.clientWidth,
        content: document.documentElement.scrollWidth,
      }));
      assert(dimensions.content <= dimensions.width + 1, '页面横向溢出');
      assert.equal(writes.length, 0);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      results.push({
        width,
        healthTotal: first.body.total,
        columnWidths: firstWidths.map((value) => Math.round(value * 100) / 100),
        automationTotal: runs.body.total,
        writes: writes.length,
        passed: true,
      });
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
