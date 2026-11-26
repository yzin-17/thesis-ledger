import { launchRegressionBrowser } from '../runtime.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
const output = process.env.MULTISELECT_QA_OUTPUT ?? '/tmp/multiselect-inline-qa';
const target = process.env.MULTISELECT_QA_TARGET ?? 'all';
const desktop = process.env.MULTISELECT_DESKTOP_ORIGIN ?? 'http://localhost:5173';
const mobile = process.env.MULTISELECT_MOBILE_ORIGIN ?? 'http://127.0.0.1:5188';
const sample = JSON.parse(await readFile(new URL('../../../../packages/schemas/fixtures/rule-source-monitor-v1.json', import.meta.url), 'utf8'));
await mkdir(output, { recursive: true });
const browser = await launchRegressionBrowser();
const errors = [];
async function checkBounds(page) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '页面不可横向溢出');
  const popups = page.locator('[data-slot="combobox-content"]:visible');
  for (const popup of await popups.all()) {
    const b = await popup.boundingBox();
    const size = page.viewportSize();
    assert(b && b.x >= -1 && b.x + b.width <= size.width + 1 && b.y >= -1 && b.y + b.height <= size.height + 1, '选项面板应在视口内');
  }
}
async function chooseDesktop(page, label, text, option) {
  const input = page.getByRole('combobox', { name: label, exact: true });
  await input.fill(text);
  await page.getByRole('option').filter({ hasText: option }).click();
  assert.equal(await input.inputValue(), '');
}
async function desktopCase(width, scenario) {
  const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  const risk = { availableRoutes: [{ provider: '邮件受控', channel: 'email', priority: 1 }, { provider: '飞书受控', channel: 'feishu', priority: 2 }], selectedProviders: ['邮件受控'], updatedAt: null };
  const state = structuredClone(sample.status);
  state.config.sourceIds = []; state.config.taskCreated = false; state.latestRun = null;
  const writes = [];
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const req = route.request(), path = new URL(req.url()).pathname;
    if (path.endsWith('/notifications/routing/risk')) {
      if (req.method() === 'GET') return route.fulfill({ json: risk });
      assert.equal(req.method(), 'PUT');
      const body = req.postDataJSON(); writes.push(body);
      if (writes.length === 1) return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
      risk.selectedProviders = body.providers;
      return route.fulfill({ json: risk });
    }
    if (path.endsWith('/rule-monitor')) return route.fulfill({ json: state });
    if (path.endsWith('/rule-monitor/task')) {
      assert.equal(req.method(), 'POST');
      const body = req.postDataJSON(); writes.push(body);
      if (writes.length === 1) return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
      state.config = { ...state.config, sourceIds: body.sourceIds, revision: body.expectedRevision + 1,
        taskCreated: true, enabled: true, cron: '@every24h', timezone: 'Asia/Shanghai', nextRunAt: '2026-11-13T00:00:00Z' };
      return route.fulfill({ json: { version: state.version, config: state.config } });
    }
    assert.equal(req.method(), 'GET', '其余接口不得写入');
    return route.fulfill({ status: 404, json: { message: '受控接口未登记' } });
  });
  await page.goto(`${desktop}/test/browser-multiselect.html?case=${scenario}`);
  if (scenario === 'capabilities') {
    const input = page.getByRole('combobox', { name: '能力（可多选）', exact: true });
    await input.waitFor();
    await chooseDesktop(page, '能力（可多选）', '报价', '报价');
    await page.getByRole('button', { name: '保存提供方', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-testid="saved-capabilities"]')?.textContent === '["notification","quote"]');
    await input.fill('报价');
    const option = page.getByRole('option').filter({ hasText: '报价' });
    await option.waitFor(); assert.equal(await option.getAttribute('aria-selected'), 'true');
    await checkBounds(page); await option.click();
    await page.getByRole('button', { name: '移除 通知', exact: true }).waitFor();
  } else if (scenario === 'risk') {
    await page.getByRole('button', { name: '移除 邮件受控（邮件）', exact: true }).waitFor();
    await chooseDesktop(page, '通知提供方', '飞书', '飞书受控');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('保存失败，选择已保留，请重试。', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-slot="combobox-chip"]').count(), 2);
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('已保存', { exact: true }).waitFor();
    assert.deepEqual(writes, [{ providers: ['邮件受控', '飞书受控'] }, { providers: ['邮件受控', '飞书受控'] }]);
  } else if (scenario === 'monitor') {
    const name = state.sources[0].name;
    await page.getByRole('combobox', { name: '选择监测来源', exact: true }).waitFor();
    await chooseDesktop(page, '选择监测来源', name, name);
    await page.getByRole('button', { name: '创建任务', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: '任务保存失败，所选来源已保留。' }).waitFor();
    assert.equal(await page.locator('[data-slot="combobox-chip"]').count(), 1);
    await page.getByRole('button', { name: '创建任务', exact: true }).click();
    await page.getByText('任务已创建，执行时间与启停在自动化中调整。', { exact: true }).waitFor();
    assert.deepEqual(writes[0].sourceIds, [state.sources[0].identity]);
    assert.deepEqual(writes[1].sourceIds, [state.sources[0].identity]);
  } else if (scenario === 'provider-models') {
    await chooseDesktop(page, '模型列表', 'alpha', 'alpha-model');
    await chooseDesktop(page, '模型列表', 'beta', 'beta-model');
    assert.equal(await page.getByTestId('models').textContent(), 'alpha-model\nbeta-model');
    const input = page.getByRole('combobox', { name: '模型列表', exact: true });
    await input.fill('alpha');
    const option = page.getByRole('option').filter({ hasText: 'alpha-model' });
    await option.waitFor(); assert.equal(await option.getAttribute('aria-selected'), 'true');
    await option.click();
    assert.equal(await input.inputValue(), '');
    assert.equal(await page.getByTestId('models').textContent(), 'beta-model');
  } else if (scenario === 'experiment-models') {
    for (const model of ['a', 'b', 'c']) await chooseDesktop(page, '搜索并选择模型', model, '来源:' + model);
    await page.getByRole('combobox', { name: '搜索并选择模型', exact: true }).fill('d');
    assert.equal(await page.getByRole('option').filter({ hasText: '来源:d' }).getAttribute('aria-disabled'), 'true');
    assert.equal(JSON.parse(await page.getByTestId('models').textContent()).length, 3);
  } else {
    await chooseDesktop(page, '搜索参赛模型', '来源乙', '相同模型 · 来源乙');
    await chooseDesktop(page, '搜索参赛模型', '来源甲', '相同模型 · 来源甲');
    assert.deepEqual(JSON.parse(await page.getByTestId('bindings').textContent()), [{ providerId: '来源乙', model: '相同模型' }, { providerId: '来源甲', model: '相同模型' }]);
  }
  await checkBounds(page);
  await page.screenshot({ path: `${output}/desktop-${scenario}-${width}.png` });
  console.log(JSON.stringify({ target: 'desktop', width, scenario, passed: true, controlledWrites: writes.length }));
  await page.close();
}
async function mobileCase(width, scenario) {
  const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce', hasTouch: true });
  page.setDefaultTimeout(10000);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
    assert.equal(route.request().method(), 'GET', '原生组件样本不允许写入');
    return route.fulfill({ status: 404, json: { message: '本页不读取业务配置' } });
  });
  await page.goto(`${mobile}/test/browser-multiselect-mobile.html?case=${scenario}`);
  const choose = async (label, text, name) => {
    const input = page.getByRole('textbox', { name: label, exact: true });
    await input.fill(text); await page.getByRole('button', { name, exact: true }).tap();
    assert.equal(await input.inputValue(), '');
  };
  if (scenario === 'ai') {
    await choose('提供方能力', '图像', '选择 图像理解');
    await choose('模型列表', 'model-b', '选择 model-b');
    await choose('模型列表', 'manual-model', '添加 manual-model');
    await page.getByRole('button', { name: '预览提交内容', exact: true }).tap();
    const body = JSON.parse(await page.getByTestId('payload').textContent());
    assert.deepEqual(body.capabilities, ['chat', 'vision']);
    assert.deepEqual(body.models, ['model-a', 'model-b', 'manual-model']);
    assert.deepEqual(body.executionRoutes, []);
    await page.getByRole('textbox', { name: '模型列表', exact: true }).fill('model-b');
    await page.getByRole('button', { name: '取消选择 model-b', exact: true }).tap();
  } else if (scenario === 'optimization') {
    for (const model of ['a', 'b', 'c']) await choose('搜索实验模型', model, `选择 模型来源 / ${model}`);
    await page.getByRole('textbox', { name: '搜索实验模型', exact: true }).fill('d');
    assert(await page.getByRole('button', { name: '选择 模型来源 / d', exact: true }).isDisabled());
    await page.getByRole('radio', { name: '高', exact: true }).first().tap();
    await page.getByRole('radio', { name: '接受所选模型的未知费用', exact: true }).tap();
    let body = JSON.parse(await page.getByTestId('payload').textContent());
    assert.equal(body.efforts[JSON.stringify(['模型来源', 'a'])], 'high');
    assert.equal(body.ack, 'yes');
    await page.getByRole('button', { name: '移除 模型来源 / a', exact: true }).tap();
    body = JSON.parse(await page.getByTestId('payload').textContent());
    assert.equal(body.models.length, 2); assert.equal(body.ack, 'no');
  } else {
    await choose('搜索参赛模型', '来源乙', '选择 相同模型 · 来源乙');
    await choose('搜索参赛模型', '来源甲', '选择 相同模型 · 来源甲');
    assert.deepEqual(JSON.parse(await page.getByTestId('payload').textContent()), [{ providerId: '来源乙', model: '相同模型' }, { providerId: '来源甲', model: '相同模型' }]);
  }
  await checkBounds(page);
  await page.screenshot({ path: `${output}/mobile-${scenario}-${width}.png` });
  console.log(JSON.stringify({ target: 'mobile', width, scenario, passed: true, nativeHost: false }));
  await page.close();
}
try {
  for (const width of [1440, 1024, 768, 390]) {
    if (target !== 'mobile') for (const scenario of ['capabilities', 'risk', 'monitor', 'arena', 'provider-models', 'experiment-models']) await desktopCase(width, scenario);
    if (target !== 'desktop') for (const scenario of ['ai', 'optimization', 'arena']) await mobileCase(width, scenario);
  }
  assert.deepEqual(errors, []);
} finally { await browser.close(); }
