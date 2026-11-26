const assert = require('node:assert/strict');
const { readFileSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.RULE_MONITOR_QA_URL || 'http://localhost:5173';
const output = '/tmp/rule-monitor-schedule-qa';
const sample = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../packages/schemas/fixtures/rule-source-monitor-v1.json'),
    'utf8',
  ),
);
mkdirSync(output, { recursive: true });

async function goToAutomation(page) {
  const marker = await page.evaluate(() => {
    window.__ruleMonitorNavigationQa = String(Math.random());
    return window.__ruleMonitorNavigationQa;
  });
  const documents = [];
  const observe = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documents.push(request.url());
  };
  page.on('request', observe);
  try {
    await page.getByRole('link', { name: '前往自动化', exact: true }).click();
    await page.waitForURL('**/providers?tab=automation');
    assert.equal(await page.evaluate(() => window.__ruleMonitorNavigationQa), marker);
    assert.deepEqual(documents, [], '应用内跳转不能请求新文档');
  } finally {
    page.off('request', observe);
  }
  return marker;
}

async function controlled(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  const state = structuredClone(sample.status);
  state.latestRun = null;
  const writes = [],
    checks = [],
    errors = [];
  let taskConflict = true,
    conflict = true,
    unavailable = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      method = req.method();
    if (path.endsWith('/rule-monitor'))
      return route.fulfill(
        unavailable ? { status: 503, json: { message: '受控读取失败' } } : { json: state },
      );
    if (path.endsWith('/rule-monitor/task') && method === 'POST') {
      const input = req.postDataJSON();
      writes.push({ path, input });
      assert.deepEqual(Object.keys(input).sort(), ['expectedRevision', 'sourceIds', 'version']);
      assert.equal(input.expectedRevision, state.config.revision);
      if (state.config.taskCreated && taskConflict) {
        taskConflict = false;
        state.config.revision++;
        return route.fulfill({ status: 409, json: { message: '来源配置已变化，请重新读取' } });
      }
      state.config = {
        ...state.config,
        revision: input.expectedRevision + 1,
        sourceIds: input.sourceIds,
        ...(state.config.taskCreated
          ? {}
          : {
              taskCreated: true,
              enabled: true,
              cron: '@every24h',
              timezone: 'Asia/Shanghai',
              nextRunAt: '2026-11-07T00:01:00+00:00',
            }),
      };
      return route.fulfill({ json: { version: state.version, config: state.config } });
    }
    if (path.endsWith('/rule-monitor/schedule') && method === 'PUT') {
      const input = req.postDataJSON();
      writes.push({ path, input });
      assert.deepEqual(Object.keys(input).sort(), [
        'cron',
        'expectedRevision',
        'timezone',
        'version',
      ]);
      assert.equal(input.expectedRevision, state.config.revision);
      if (conflict) {
        conflict = false;
        state.config.revision++;
        return route.fulfill({ status: 409, json: { message: '计划已变化，请重试' } });
      }
      state.config = {
        ...state.config,
        revision: input.expectedRevision + 1,
        cron: input.cron,
        timezone: input.timezone,
        nextRunAt: '2026-11-07T02:00:00+00:00',
      };
      return route.fulfill({ json: { version: state.version, config: state.config } });
    }
    if (path.endsWith('/rule-monitor/config') && method === 'PUT') {
      const input = req.postDataJSON();
      writes.push({ path, input });
      state.config = {
        ...state.config,
        revision: input.expectedRevision + 1,
        sourceIds: input.sourceIds,
        enabled: input.enabled,
      };
      return route.fulfill({ json: { version: state.version, config: state.config } });
    }
    if (path.endsWith('/rule-monitor/checks') && method === 'POST') {
      const input = req.postDataJSON();
      checks.push(input);
      writes.push({ path, input });
      if (checks.length === 1) return route.abort('failed');
      state.latestRun = { ...sample.queued.run, id: input.requestId, sourceIds: input.sourceIds };
      return route.fulfill({ json: { version: state.version, run: state.latestRun } });
    }
    if (!['GET', 'HEAD'].includes(method)) throw new Error(`未授权写入 ${method} ${path}`);
    if (path.endsWith('/automations'))
      return route.fulfill({
        json: !state.config.taskCreated
          ? []
          : [
              {
                id: 'rule-source-monitor',
                name: '收费资料更新检查',
                type: 'rule-source-monitor',
                cron: state.config.cron,
                timezone: state.config.timezone,
                enabled: unavailable ? null : state.config.enabled,
                nextRunAt: state.config.nextRunAt,
                managed: true,
                source: 'rule-monitor',
                ...(unavailable ? { readError: 'rule_monitor_unavailable' } : {}),
              },
            ],
      });
    return route.continue();
  });
  await page.goto(origin + '/market-data?section=monitor');
  const monitor = page.getByRole('region', { name: '收费资料更新监测', exact: true });
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).waitFor();
  assert.equal(await monitor.getByRole('switch').count(), 0);
  assert.equal(await monitor.getByRole('combobox').count(), 1);
  assert.equal(await monitor.getByRole('button', { name: '立即检查', exact: true }).count(), 0);
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).fill(state.sources[0].name);
  await page.getByRole('option').filter({ hasText: state.sources[0].name }).click();
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await page.getByText('任务已创建，执行时间与启停在自动化中调整。', { exact: true }).waitFor();
  assert.equal(state.config.cron, '@every24h');
  assert.equal(checks.length, 0);
  await goToAutomation(page);
  assert.equal(
    await page.getByRole('tab', { name: '自动化', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  const row = page.getByRole('row').filter({ hasText: '收费资料更新检查' }).first();
  const dialog = page.getByRole('dialog', { name: '编辑自动化任务', exact: true });
  const edit = row.getByRole('button', { name: '编辑', exact: true });
  await edit.click();
  const time = dialog.getByRole('combobox', { name: '执行时间', exact: true });
  assert((await time.textContent()).includes('每24小时'));
  assert.equal(await dialog.getByRole('switch').count(), 0);
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  assert.equal(await dialog.getByRole('textbox').count(), 0);
  const bounds = await dialog.boundingBox();
  assert(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1 && bounds.height <= 901);
  await time.click();
  await page.getByRole('option', { name: '每天 06:30', exact: true }).click();
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await page.getByText('保存任务失败', { exact: true }).first().waitFor();
  assert((await time.textContent()).includes('每天 06:30'));
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.config.cron, '30 6 * * *');
  await edit.click();
  await time.click();
  await page.getByRole('option', { name: '自定义', exact: true }).click();
  await dialog.getByRole('textbox', { name: 'Cron 表达式', exact: true }).fill('0 10 * * 1-5');
  await page.screenshot({ path: `${output}/editor-${width}.png` });
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  const beforeSources = {
    cron: state.config.cron,
    nextRunAt: state.config.nextRunAt,
    enabled: state.config.enabled,
  };
  await page.goto(origin + '/market-data?section=monitor');
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).fill(state.sources[1].name);
  await page.getByRole('option').filter({ hasText: state.sources[1].name }).click();
  await page.getByRole('button', { name: '更新任务来源', exact: true }).click();
  await monitor
    .getByText('任务保存失败，所选来源已保留。', { exact: true })
    .waitFor();
  await monitor.getByRole('button', { name: '更新任务来源', exact: true }).click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-slot="combobox-chip"]').length === 2,
  );
  await page
    .getByRole('button', { name: '更新任务来源', exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(() =>
    [...document.querySelectorAll('button')].some(
      (button) =>
        button.textContent === '更新任务来源' &&
        button.disabled &&
        button.getAttribute('aria-busy') === 'false',
    ),
  );
  assert.deepEqual(
    { cron: state.config.cron, nextRunAt: state.config.nextRunAt, enabled: state.config.enabled },
    beforeSources,
  );
  await goToAutomation(page);
  await edit.click();
  assert.equal(
    await dialog.getByRole('textbox', { name: 'Cron 表达式', exact: true }).inputValue(),
    '0 10 * * 1-5',
  );
  await time.click();
  await page.getByRole('option', { name: '每24小时', exact: true }).click();
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await page.getByRole('button', { name: '放弃修改并关闭', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.config.cron, '0 10 * * 1-5');
  await edit.click();
  await time.click();
  await page.getByRole('option', { name: '每24小时', exact: true }).click();
  await dialog.getByRole('button', { name: '保存修改', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  assert.equal(state.config.cron, '@every24h');
  await row.getByRole('button', { name: '停用', exact: true }).click();
  await row.getByRole('button', { name: '启用', exact: true }).waitFor();
  await row.getByRole('button', { name: '启用', exact: true }).click();
  await row.getByRole('button', { name: '停用', exact: true }).waitFor();
  await row.getByRole('button', { name: '立即运行', exact: true }).click();
  await page.getByRole('heading', { name: '检查结果暂未确认', exact: true }).waitFor();
  await row.getByRole('button', { name: '立即运行', exact: true }).click();
  await page.getByRole('heading', { name: '收费资料更新检查已提交', exact: true }).waitFor();
  assert.deepEqual(checks[0], checks[1]);
  assert.deepEqual(checks[0].sourceIds, state.config.sourceIds);
  assert.equal(await row.getByRole('button', { name: '运行中…', exact: true }).isDisabled(), true);
  unavailable = true;
  await page.getByRole('button', { name: '刷新数据与自动化', exact: true }).click();
  await row.getByText('读取失败', { exact: true }).waitFor();
  assert.equal(await row.getByRole('button', { name: '启用', exact: true }).isDisabled(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      width,
      createDefault24h: true,
      scheduleOnly: true,
      preset: true,
      customCron: true,
      conflictPreserved: true,
      sourceUpdatePreservesPlan: true,
      toggle: true,
      idempotentRun: true,
      realWrites: 0,
      controlledWrites: writes.length,
      softNavigation: true,
    }),
  );
  await page.close();
}

async function live(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const writes = [];
  await page.route('**/api/**', (route) => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    writes.push(route.request().method());
    return route.abort();
  });
  await page.goto(origin + '/providers?tab=automation');
  const row = page.getByRole('row').filter({ hasText: '收费资料更新检查' }).first();
  await row.getByRole('button', { name: '编辑', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '编辑自动化任务', exact: true });
  await dialog.getByRole('combobox', { name: '执行时间', exact: true }).waitFor();
  assert.equal(await dialog.getByRole('checkbox').count(), 0);
  assert.equal(await dialog.getByRole('switch').count(), 0);
  await page.screenshot({ path: `${output}/live-${width}.png` });
  await dialog.getByRole('button', { name: '取消', exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
  await page.goto(origin + '/market-data?section=monitor');
  const monitor = page.getByRole('region', { name: '收费资料更新监测', exact: true });
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).waitFor();
  assert.equal(await monitor.getByRole('switch').count(), 0);
  assert.equal(await monitor.getByRole('button', { name: '立即检查', exact: true }).count(), 0);
  const marker = await goToAutomation(page);
  assert.equal(
    await page.getByRole('tab', { name: '自动化', exact: true }).getAttribute('aria-selected'),
    'true',
  );
  await page.goBack();
  await page.waitForURL('**/market-data?section=monitor');
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__ruleMonitorNavigationQa), marker);
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
      await controlled(browser, width);
      if (process.env.RULE_MONITOR_QA_LIVE === '1') await live(browser, width);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
