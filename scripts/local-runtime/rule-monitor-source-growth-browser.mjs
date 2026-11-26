import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.RULE_MONITOR_QA_URL ?? 'http://localhost:5173';
const output = process.env.RULE_MONITOR_QA_OUTPUT ?? '/tmp/rule-monitor-source-growth-qa';
const root = '/api/market-data/rule-monitor';
const live = await (await fetch(origin + root)).json();
assert(live.sources.length >= 10);
const before = JSON.stringify(live.config);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_EXECUTABLE,
});

async function controlled(width, count) {
  const state = structuredClone(live);
  state.latestRun = null;
  state.observations = [];
  while (state.sources.length < count) {
    const index = state.sources.length;
    state.sources.push({
      ...state.sources[0],
      identity: `official-rules/controlled-${index}`,
      name: `受控扩展来源 ${index}`,
    });
  }
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  const errors = [],
    writes = [];
  let failRead = false;
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      if (path === root) {
        if (failRead) return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
        return route.fulfill({ json: state });
      }
      return route.continue();
    }
    if (request.method() !== 'POST' || path !== root + '/task') {
      errors.push(`非预期写入 ${request.method()} ${path}`);
      return route.abort();
    }
    const input = request.postDataJSON();
    writes.push(input);
    assert.equal(input.expectedRevision, state.config.revision);
    assert.equal(input.sourceIds.length, count);
    if (writes.length === 1) {
      state.config.revision++;
      return route.fulfill({
        status: 409,
        json: { code: 'rule_monitor_conflict', message: '受控修订冲突' },
      });
    }
    state.config = {
      ...state.config,
      sourceIds: input.sourceIds,
      revision: input.expectedRevision + 1,
    };
    return route.fulfill({ json: { version: state.version, config: state.config } });
  });
  try {
    await page.goto(origin + '/market-data?section=monitor');
    const monitor = page.getByRole('region', { name: '收费资料更新监测', exact: true });
    const input = monitor.getByRole('combobox', { name: '选择监测来源', exact: true });
    await input.waitFor();
    await page.waitForLoadState('networkidle');
    for (const source of state.sources.filter(
      (item) => !state.config.sourceIds.includes(item.identity),
    )) {
      await input.fill(source.name);
      await page.getByRole('option').filter({ hasText: source.name }).waitFor({ state: 'visible' });
      await input.press('ArrowDown');
      await input.press('Enter');
    }
    await monitor.getByText(`已选 ${count} / ${count} 项`, { exact: false }).waitFor();
    const save = monitor.getByRole('button', { name: '更新任务来源', exact: true });
    const invalidation = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === root && response.request().method() === 'GET',
    );
    await save.click();
    await monitor.getByText('任务保存失败，所选来源已保留。', { exact: true }).waitFor();
    await invalidation;
    await page.screenshot({ path: `${output}/error-${width}-${count}.png`, fullPage: true });
    assert.equal(
      await monitor.getByRole('button', { name: '重新读取任务', exact: true }).count(),
      0,
    );
    failRead = true;
    const failedRead = page.waitForResponse(
      (response) => new URL(response.url()).pathname === root && response.status() === 503,
    );
    await save.click();
    await failedRead;
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) =>
          button.textContent === '更新任务来源' &&
          !button.disabled &&
          button.getAttribute('aria-busy') === 'false',
      ),
    );
    assert.equal(writes.length, 1);
    assert.equal(await monitor.locator('[data-slot="combobox-chip"]').count(), count);
    failRead = false;
    assert.equal(writes.length, 1);
    const saved = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === root + '/task' && response.status() === 200,
    );
    await save.click();
    await saved;
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some(
        (button) => button.textContent === '更新任务来源' && button.disabled,
      ),
    );
    assert.equal(writes.length, 2);
    assert.deepEqual(writes[1].sourceIds, writes[0].sourceIds);
    assert.equal(writes[1].expectedRevision, writes[0].expectedRevision + 1);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/${width}-${count}.png`, fullPage: true });
    console.log(
      JSON.stringify({
        width,
        count,
        controlledWrites: writes.length,
        manualSaveRetry: true,
        passed: true,
      }),
    );
  } finally {
    await page.close();
  }
}

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.route('**/api/**', (route) => {
    if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
    return route.abort();
  });
  await page.goto(origin + '/market-data?section=monitor');
  const monitor = page.getByRole('region', { name: '收费资料更新监测', exact: true });
  await monitor.getByRole('combobox', { name: '选择监测来源', exact: true }).waitFor();
  assert.equal(
    await monitor.locator('[data-slot="combobox-chip"]').count(),
    live.config.sourceIds.length,
  );
  await page.screenshot({ path: `${output}/live-readonly.png`, fullPage: true });
  await page.close();
  console.log(
    JSON.stringify({
      liveReadOnly: true,
      sources: live.sources.length,
      saved: live.config.sourceIds.length,
    }),
  );
  for (const width of [1440, 1024, 768, 390]) await controlled(width, live.sources.length);
  await controlled(1440, live.sources.length + 7);
  const after = await (await fetch(origin + root)).json();
  assert.equal(JSON.stringify(after.config), before);
  console.log('真实监测配置保持不变；全部保存和故障注入均由浏览器受控请求承载。');
} finally {
  await browser.close();
}
