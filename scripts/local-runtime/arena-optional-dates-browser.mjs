// 可选赛期的真实组件验收，全部业务接口由受控响应接管。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaLiveSetupFields, arenaResourceFields } = await import('../../packages/api-client/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs'), live = arenaLiveFixture(s);
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5173', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-optional-dates-qa';
const optionalBudgets = process.env.ARENA_OPTIONAL_BUDGETS === '1';
const optionalRequests = process.env.ARENA_OPTIONAL_REQUEST_LIMITS === '1';
const inlineValidation = process.env.ARENA_INLINE_VALIDATION === '1';
const singleModel = process.env.ARENA_SINGLE_MODEL === '1';
const unlimited = { requests: null, tokens: null, costMicros: null };
const cases = optionalBudgets ? [['', '', {}], ['', '', { requests: '5', cost: '0.000001', allRequests: '2' }], ['', '', { requests: '0', allCost: '0' }]] : [['', ''], ['2026-11-13', ''], ['', '2026-11-20']];
const models = ['Atlas', 'Orion'], contract = { id: 'arena_live_research', version: 'arena-live-research-v2' };
const providers = s.aiProviderRecordsSchema.parse([{ name: '受控模型', type: 'ai', enabled: true, priority: 1, capabilities: [], health: 'healthy',
  modelPricing: Object.fromEntries(models.map((model) => [model, { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' }])),
  executionRoutes: models.map((model) => ({ model, adapter: 'openai-compatible', mode: 'json_validated', contract, adapterEvidence: null,
    readiness: { state: 'blocked', reasons: ['budget_not_authorized'], configurationFingerprint: 'controlled', evaluatedAt: '2026-11-12T00:00:00Z' },
    liveValidation: { status: 'passed', checkedAt: '2026-11-12T00:00:00Z', requestId: live.ids.a } })),
}]);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], writes = [];
    let protocol, state = 'draft', calendarReads = 0, nextFailure = null;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let body;
      if (req.method() === 'POST') {
        writes.push(path);
        if (nextFailure && path === '/api/v1/arena-matches') {
          const failure = nextFailure; nextFailure = null;
          return route.fulfill({ status: failure.status, json: failure.body });
        }
        if (path === '/api/v1/arena-matches') { protocol = s.arenaLiveProtocolSchema.parse(req.postDataJSON()); state = 'draft'; }
        else { const action = path.split('/').at(-1); assert(['start', 'end'].includes(action)); state = action === 'start' ? 'running' : 'ended'; }
        body = { id: live.ids.match, state };
      } else {
        assert.equal(req.method(), 'GET');
        if (path === '/api/v1/ai/providers') body = providers;
        else if (path.includes('/watchlist')) body = { revision: 1, items: [], groups: [], nextOffset: null };
        else if (path.endsWith('/calendar')) { calendarReads++; body = { calendarId: 'CN', calendarVersion: 'controlled', timeZone: 'Asia/Shanghai' }; }
        else if (path === '/api/v1/arena-matches/' + live.ids.match) body = { ...live.detail, state, protocol, remaining: protocol.budget,
          agents: live.detail.agents.slice(0, protocol.entrants.length).map((a, i) => ({ ...a, remaining: protocol.entrants[i].budget, cycles: [],
            account: { ...a.account, cash: protocol.initialCash, positions: [], orders: [], fills: [], wakeups: [], watchedSymbols: [] },
            availability: { cash: null, tradingDate: null, shares: {} },
          })), frames: [], periodReturns: [], sealedFrame: null };
        else if (path.endsWith('/catalog')) body = { items: [{ id: live.ids.match, kind: 'live', title: '持续比赛', market: 'CN', state: 'ended', startsOn: null, endsOn: null, createdAt: '2026-11-12T00:00:00Z', models: [] }], total: 1, totalUnfiltered: 1, page: 1, pageSize: 25 };
      }
      assert(body, '未登记的请求 ' + path); await route.fulfill({ json: body });
    });
    for (const [index, [startsOn, endsOn, budget]] of cases.entries()) {
      const before = calendarReads;
      await page.goto(origin + '/test/browser-arena-live.html?path=/arena/new');
      await page.getByRole('textbox', { name: '比赛名称', exact: true }).fill('持续比赛');
      await page.getByRole('button', { name: '全市场自主选股', exact: true }).click();
      if (inlineValidation && index === 0) {
          const beforeWrites = writes.length;
          await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
          const group = page.getByRole('group', { name: '参赛模型校验', exact: true });
          await group.getByRole('alert').getByText('请选择参赛模型', { exact: true }).waitFor();
          await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '参赛模型校验');
          assert.equal(writes.length, beforeWrites);
          assert.equal(await page.getByRole('complementary', { name: '比赛草稿摘要' }).getByRole('alert').count(), 0);
          await page.screenshot({ path: output + '/' + width + '-model-error.png', fullPage: true });
          await group.screenshot({ path: output + '/' + width + '-model-error-detail.png' });
      }
      for (const model of models.slice(0, singleModel ? 1 : 2)) {
        await page.getByRole('combobox', { name: '搜索参赛模型', exact: true }).fill(model); await page.getByRole('option').filter({ hasText: model }).click();
        assert.equal(await page.getByText('请选择参赛模型', { exact: true }).count(), 0);
      }
      await page.keyboard.press('Escape');
      await page.locator('[data-slot="combobox-content"]').waitFor({ state: 'hidden' });
      if (startsOn) await page.getByRole('textbox', { name: '开始日期', exact: true }).fill(startsOn);
      if (endsOn) await page.getByRole('textbox', { name: '结束日期', exact: true }).fill(endsOn);
      if (optionalBudgets) {
        for (const key of ['requests', 'tokens', 'cost', 'allRequests', 'allTokens', 'allCost']) {
          const label = arenaLiveSetupFields.find(([name]) => name === key)[1], input = page.getByRole('textbox', { name: label, exact: true });
          assert.equal(await input.inputValue(), ''); assert.equal(await input.getAttribute('placeholder'), '不限额');
          if (budget[key] !== undefined) await input.fill(budget[key]);
        }
        await page.screenshot({ path: output + '/' + width + '-budget-form-' + index + '.png', fullPage: true });
      }
      if (optionalRequests) {
        for (const label of ['每次请求输入上限', '每次请求输出上限']) {
          const field = page.getByRole('textbox', { name: label, exact: true });
          assert.equal(await field.inputValue(), ''); assert.equal(await field.getAttribute('placeholder'), '不限额');
        }
        await page.getByRole('heading', { name: '研究设置', exact: true }).waitFor();
        await page.getByRole('heading', { name: '行情观察设置', exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '研究与行情观察设置', exact: true }).count(), 0);
        for (const key of ['maxResearchSteps', 'maxCycleSeconds']) {
          const label = arenaResourceFields.find(([name]) => name === key)[1];
          const field = page.getByRole('textbox', { name: label, exact: true });
          assert.equal(await field.inputValue(), ''); assert.equal(await field.getAttribute('placeholder'), '不限制');
        }
        if (index === 0) {
          for (const key of ['title', 'initialCash', 'maxPositionBps', 'buyBps', 'sellBps', 'minimum', 'slippageBps', ...arenaResourceFields.map(([key]) => key)]) {
            const label = [...arenaLiveSetupFields, ...arenaResourceFields].find(([name]) => name === key)[1];
            const field = page.getByRole('textbox', { name: label, exact: true });
            const placeholder = await field.getAttribute('placeholder');
            assert(['maxResearchSteps', 'maxCycleSeconds'].includes(key) ? placeholder === '不限制' : placeholder.startsWith('默认 ')); await field.fill('');
          }
          const beforeWrites = writes.length;
          await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).fill('0');
          await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
          await page.getByRole('alert').waitFor(); assert.equal(writes.length, beforeWrites);
          if (inlineValidation) {
            const field = page.getByRole('textbox', { name: '每次请求输出上限', exact: true });
            assert.equal(await field.getAttribute('aria-invalid'), 'true');
            const describedBy = await field.getAttribute('aria-describedby');
            assert(describedBy);
            assert.match(await field.evaluate((element) => (element.getAttribute('aria-describedby') ?? '').split(/\s+/).map((id) => document.getElementById(id)?.textContent).join(' ')), /请输入正整数/);
            await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '每次请求输出上限');
            assert.equal(await page.getByRole('complementary', { name: '比赛草稿摘要' }).getByRole('alert').count(), 0);
          }
          await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).fill('');
        } else {
          await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).fill('2048');
          if (index === 1) await page.getByRole('textbox', { name: '单次研究步骤上限', exact: true }).fill('5');
          else await page.getByRole('textbox', { name: '单次研究时限（秒）', exact: true }).fill('600');
        }
        await page.screenshot({ path: output + '/' + width + '-optional-request-form-' + index + '.png', fullPage: true });
      }
      if (inlineValidation && index === 0) {
        await page.getByRole('textbox', { name: '开始日期', exact: true }).fill('2026-11-20');
        await page.getByRole('textbox', { name: '结束日期', exact: true }).fill('2026-11-13');
        await page.getByRole('textbox', { name: '每个模型的费用总额', exact: true }).fill('0.0000001');
        await page.getByRole('textbox', { name: '单次研究步骤上限', exact: true }).fill('0');
        const beforeWrites = writes.length;
        await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
        for (const name of ['结束日期', '每个模型的费用总额', '单次研究步骤上限']) assert.equal(await page.getByRole('textbox', { name, exact: true }).getAttribute('aria-invalid'), 'true');
        await page.getByText('赛期结束早于开始', { exact: true }).waitFor(); assert.equal(writes.length, beforeWrites);
        await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '结束日期');
        await page.screenshot({ path: output + '/' + width + '-field-errors.png', fullPage: true });
        for (const name of ['开始日期', '结束日期', '每个模型的费用总额', '单次研究步骤上限']) await page.getByRole('textbox', { name, exact: true }).fill('');
        assert.equal(await page.getByRole('alert').count(), 0);
        nextFailure = { status: 500, body: { error: 'internal_error', message: '受控保存失败' } };
        await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
        await page.getByRole('complementary', { name: '比赛草稿摘要' }).getByRole('alert').waitFor();
        nextFailure = { status: 400, body: { error: 'validation_error', message: '输入不符合要求', fields: [{ path: 'resources.maxResearchSteps', message: '研究步骤配置已变化' }] } };
        await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
        await page.getByRole('alert').getByText('研究步骤配置已变化', { exact: true }).waitFor();
        assert.equal(await page.getByRole('complementary', { name: '比赛草稿摘要' }).getByRole('alert').count(), 0);
        await page.getByRole('textbox', { name: '单次研究步骤上限', exact: true }).fill('5');
        assert.equal(await page.getByText('研究步骤配置已变化', { exact: true }).count(), 0);
        await page.getByRole('textbox', { name: '单次研究步骤上限', exact: true }).fill('');
      }
      await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
      await page.getByRole('heading', { level: 1, name: optionalRequests && index === 0 ? '自主模型比赛' : '持续比赛', exact: true }).waitFor();
      assert.equal(protocol.entrants.length, singleModel ? 1 : 2);
      assert.equal(protocol.startsOn, startsOn || null); assert.equal(protocol.endsOn, endsOn || null);
      assert.equal(protocol.calendarVersion, null); assert.equal(calendarReads, before);
      if (optionalRequests) {
        assert(protocol.entrants.every((e) => e.maxInputTokens === null && e.maxOutputTokens === (index === 0 ? null : 2048)));
        assert.equal(protocol.resources.maxResearchSteps, index === 1 ? 5 : null);
        assert.equal(protocol.resources.maxCycleSeconds, index === 2 ? 600 : null);
        assert.equal(protocol.decisionDeadlineMinutes, index === 2 ? 10 : null);
        if (index === 0) { assert.equal(protocol.initialCash, '100000'); assert.equal(protocol.fees.minimum, '0'); }
      }
      if (optionalBudgets) {
        const expected = [unlimited, { ...unlimited, requests: 2 }, { ...unlimited, costMicros: 0 }][index];
        const expectedAgent = [unlimited, { ...unlimited, requests: 5, costMicros: 1 }, { ...unlimited, requests: 0 }][index];
        assert.deepEqual(protocol.budget, expected); assert(protocol.entrants.every((e) => JSON.stringify(e.budget) === JSON.stringify(expectedAgent)));
        await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
        const panel = page.getByRole('tabpanel', { name: '比赛设置', exact: true });
        if (optionalRequests) assert.equal(await panel.getByText('不限制', { exact: true }).count(), index === 0 ? 2 : 1);
        assert(await panel.getByText('不限额', { exact: true }).count() >= 4);
        if (index === 2) assert.equal(await panel.getByText('0 USD', { exact: true }).count(), 2);
        await page.getByRole('tab', { name: '模型账户', exact: true }).click();
        const accounts = page.getByRole('tabpanel', { name: '模型账户', exact: true });
        if (index === 0) assert.equal(await accounts.getByText('不限额', { exact: true }).count(), 4);
        if (index === 2) await accounts.getByText('0 次', { exact: true }).waitFor();
        await page.screenshot({ path: output + '/' + width + '-budget-account-' + index + '.png', fullPage: true });
        await page.getByRole('tab', { name: '收益表现', exact: true }).click();
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      if (!startsOn && !endsOn && index === 0) {
        await page.getByText('手动启动 · 手动结束', { exact: true }).waitFor();
        await page.getByRole('button', { name: '启动比赛', exact: true }).click();
        await page.getByRole('button', { name: '暂停比赛', exact: true }).waitFor();
        await page.getByRole('button', { name: '结束比赛', exact: true }).click();
        await page.getByText('已结束', { exact: true }).waitFor();
        await page.screenshot({ path: output + '/' + width + '-ended.png', fullPage: true });
      }
    }
    if (inlineValidation) {
      const beforeWrites = writes.length;
      await page.goto(origin + '/test/browser-arena-live.html?path=/arena/history/new');
      await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
      await page.getByRole('group', { name: '参赛模型校验', exact: true }).getByRole('alert').waitFor();
      await page.getByRole('group', { name: '标的池校验', exact: true }).getByRole('alert').waitFor();
      assert.equal(await page.getByRole('textbox', { name: '比赛名称', exact: true }).getAttribute('aria-invalid'), 'true');
      assert.equal(writes.length, beforeWrites);
      await page.screenshot({ path: output + '/' + width + '-daily-errors.png', fullPage: true });
    }
    await page.goto(origin + '/test/browser-arena-live.html?path=/arena');
    await page.getByRole('table', { name: '比赛列表', exact: true }).getByText('手动启动 · 手动结束', { exact: true }).waitFor();
    assert.deepEqual(errors, []); assert.equal(writes.filter((p) => p.endsWith('/end')).length, 1);
    console.log(JSON.stringify({ width, optionalCombinations: 3, optionalBudgets, optionalRequests, inlineValidation, singleModel, calendarReads, endWhileRunning: true, catalog: true, controlledWrites: writes.length, realRequests: 0 }));
    await page.close();
  }
} finally { await browser.close(); }
