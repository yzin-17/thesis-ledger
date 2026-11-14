const assert = require('node:assert/strict');
const { mkdirSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.RULE_MONITOR_QA_URL || 'http://localhost:5173';
const output = process.env.RULE_MONITOR_QA_OUTPUT || '/tmp/rule-monitor-automation-qa';
const sample = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../packages/schemas/fixtures/rule-source-monitor-v1.json'),
    'utf8',
  ),
);
mkdirSync(output, { recursive: true });

async function versionDetails(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const writes = [],
    responses = [];
  await page.route('**/api/**', (route) => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    writes.push(route.request().method());
    return route.abort();
  });
  page.on('response', (response) => {
    if (response.url().includes('/rule-monitor/versions')) responses.push(response.status());
  });
  await page.goto(origin + '/market-data?section=monitor');
  const trigger = page.getByRole('button', { name: /^查看版本/ }).first();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: '资料版本记录', exact: true });
  await dialog.getByText('首次观察', { exact: false }).first().waitFor();
  const bounds = await dialog.boundingBox();
  assert(bounds && bounds.y >= 0 && bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
  assert(bounds.height <= 901, '抽屉必须在视口内滚动');
  await page.screenshot({ path: `${output}/versions-${width}.png` });
  await dialog.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(
    await trigger.evaluate((element) => element === document.activeElement),
    true,
    '关闭后回到版本入口',
  );
  const next = page.getByRole('button', { name: /^查看版本/ }).nth(1);
  await next.click();
  await dialog.getByText('首次观察', { exact: false }).first().waitFor();
  await dialog.getByRole('button', { name: '关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert(responses.every((status) => status === 200));
  assert.deepEqual(writes, []);
  await page.close();
}

async function automationHistory(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const writes = [],
    errors = [];
  let degraded = false;
  const monitor = {
    id: 'rule-source-monitor',
    name: '收费资料更新检查',
    type: 'rule-source-monitor',
    cron: '',
    timezone: 'UTC',
    enabled: false,
    nextRunAt: null,
    managed: true,
    source: 'rule-monitor',
    scheduleLabel: '每24小时检查一次（从上次检查起）',
  };
  const run = {
    id: 'rule-source-monitor:sample',
    jobId: monitor.id,
    jobName: monitor.name,
    status: 'partial',
    startedAt: sample.status.latestRun.startedAt,
    createdAt: sample.status.latestRun.createdAt,
    error: '收费通告：资料网站返回错误',
    summary: '自动检查；已检查5份资料，0条变化，1份暂不可读',
  };
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (!['GET', 'HEAD'].includes(request.method())) {
      writes.push(request.method());
      return route.abort();
    }
    if (path.endsWith('/automations'))
      return route.fulfill({
        json: [
          degraded ? { ...monitor, enabled: null, readError: 'rule_monitor_unavailable' } : monitor,
        ],
      });
    if (path.endsWith('/automations/history') || path.endsWith('/automations/issues'))
      return route.fulfill({
        json: {
          items: [run],
          page: 1,
          pageSize: 20,
          total: 1,
          totalPages: 1,
          ...(degraded
            ? { sourceWarnings: [{ source: 'rule-monitor', code: 'rule_monitor_unavailable' }] }
            : {}),
        },
      });
    return route.continue();
  });
  await page.goto(origin + '/providers');
  await page.getByRole('tab', { name: '自动化', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '收费资料更新检查' }).first();
  await row.getByRole('button', { name: '编辑', exact: true }).waitFor();
  assert.equal(await row.getByRole('button').count(), 3, '系统任务统一启停、编辑和运行操作');
  await page.getByText('部分资料不可读', { exact: true }).waitFor();
  await page.getByText('收费通告：资料网站返回错误', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/automation-${width}.png`, fullPage: true });
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const editor = page.getByRole('dialog', { name: '编辑自动化任务', exact: true });
  await editor.getByRole('combobox', { name: '执行时间', exact: true }).waitFor();
  await editor.getByRole('button', { name: '取消', exact: true }).click();
  await editor.waitFor({ state: 'hidden' });
  degraded = true;
  await page.goto(origin + '/providers');
  await page.getByRole('tab', { name: '自动化', exact: true }).click();
  await page.getByText('读取失败', { exact: true }).waitFor();
  await page.getByText('收费资料检查记录暂时无法读取', { exact: true }).waitFor();
  await page.getByText('收费通告：资料网站返回错误', { exact: true }).waitFor();
  await page.getByRole('tab', { name: '诊断', exact: true }).click();
  await page.getByText('收费资料检查记录暂时无法读取', { exact: true }).waitFor();
  await page.getByText('部分资料不可读', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
  assert.deepEqual(writes, []);
  await page.close();
}

async function realAutomationHistory(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const writes = [];
  await page.route('**/api/**', (route) => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    writes.push(route.request().method());
    return route.abort();
  });
  await page.goto(origin + '/providers');
  await page.getByRole('tab', { name: '自动化', exact: true }).click();
  await page.getByRole('heading', { name: '自动化运行历史', exact: true }).waitFor();
  const filter = page.getByRole('combobox', { name: '任务', exact: true });
  await filter.click();
  const popup = await page.getByRole('listbox').boundingBox();
  assert(popup && popup.x >= 0 && popup.x + popup.width <= width + 1);
  const response = page.waitForResponse((value) => {
    const url = new URL(value.url());
    return (
      url.pathname.endsWith('/automations/history') &&
      url.searchParams.get('jobId') === 'rule-source-monitor'
    );
  });
  await page.getByRole('option', { name: '收费资料更新检查', exact: true }).click();
  const result = await response;
  assert.equal(new URL(result.url()).searchParams.get('page'), '1');
  const history = await result.json();
  assert.equal(history.total, 2);
  assert(history.items.every((item) => item.jobId === 'rule-source-monitor'));
  await page.getByText('共 2 条', { exact: false }).waitFor();
  await page.getByText('1份资料暂不可读；该历史记录未保留逐项失败原因', { exact: true }).waitFor();
  assert((await filter.textContent()).includes('收费资料更新检查'));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: `${output}/real-automation-${width}.png`, fullPage: true });
  await filter.click();
  await page.getByRole('option', { name: '全部任务', exact: true }).click();
  assert.deepEqual(writes, []);
  await page.close();
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE,
  });
  try {
    for (const width of [1440, 1024, 768, 390]) {
      await versionDetails(browser, width);
      await automationHistory(browser, width);
      await realAutomationHistory(browser, width);
      console.log(
        JSON.stringify({
          width,
          realVersionsVisible: true,
          focusRestored: true,
          controlledAutomation: true,
          failureReason: true,
          sourceFailureVisible: true,
          writes: 0,
        }),
      );
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
