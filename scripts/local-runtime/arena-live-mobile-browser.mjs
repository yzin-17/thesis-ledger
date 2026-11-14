import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const schemas = await import('../../packages/schemas/dist/index.js');
const { arenaLiveSetupFields, arenaResourceFields } = await import('../../packages/api-client/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs'), { detail, ids } = arenaLiveFixture(schemas);
const openSeason = process.env.ARENA_MOBILE_OPEN_SEASON === '1';
const unlimitedBudget = process.env.ARENA_MOBILE_UNLIMITED_BUDGET === '1';
const optionalRequests = process.env.ARENA_OPTIONAL_REQUEST_LIMITS === '1';
const inlineValidation = process.env.ARENA_INLINE_VALIDATION === '1';
const singleModel = process.env.ARENA_SINGLE_MODEL === '1';
const providers = schemas.aiProviderRecordsSchema.parse([{ name: '受控模型', type: 'ai', enabled: true, priority: 1, capabilities: [], health: 'healthy',
  modelPricing: Object.fromEntries(['Atlas', 'Orion'].map((model) => [model, { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' }])),
  executionRoutes: ['Atlas', 'Orion'].map((model) => ({ model, adapter: 'openai-compatible', mode: 'json_validated', contract: { id: 'arena_live_research', version: 'arena-live-research-v2' }, adapterEvidence: null,
    readiness: { state: 'blocked', reasons: ['budget_not_authorized'], configurationFingerprint: 'controlled', evaluatedAt: '2026-11-12T00:00:00Z' },
    liveValidation: { status: 'passed', checkedAt: '2026-11-12T00:00:00Z', requestId: ids.a } })),
}]);
const origin = process.env.ARENA_MOBILE_QA_ORIGIN ?? 'http://127.0.0.1:5188', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-live-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.ARENA_QA_CHANNEL ?? 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    let created = null;
    let current = openSeason ? schemas.arenaLiveDetailSchema.parse({ ...detail, protocol: { ...detail.protocol, startsOn: null, endsOn: null, calendarVersion: null } }) : detail;
    if (unlimitedBudget) {
      const budget = { requests: null, tokens: null, costMicros: null };
      current = schemas.arenaLiveDetailSchema.parse({ ...current, remaining: budget,
        protocol: { ...current.protocol, budget, ...(optionalRequests ? { resources: { ...current.protocol.resources, maxResearchSteps: null, maxCycleSeconds: null }, decisionDeadlineMinutes: null } : {}), entrants: current.protocol.entrants.map((e) => ({ ...e, budget, ...(optionalRequests ? { maxInputTokens: null, maxOutputTokens: null } : {}) })) },
        agents: current.agents.map((a) => ({ ...a, remaining: budget })),
      });
    }
    if (singleModel) {
      const frame = (value) => value && ({ ...value, marks: value.marks.filter((mark) => mark.agentId === ids.a).map((mark) => ({ ...mark, rank: mark.rank === null ? null : 1 })) });
      current = schemas.arenaLiveDetailSchema.parse({ ...current, protocol: { ...current.protocol, entrants: current.protocol.entrants.slice(0, 1) },
        agents: current.agents.slice(0, 1), frames: current.frames.map(frame), sealedFrame: frame(current.sealedFrame),
        periodReturns: current.periodReturns.map((period) => ({ ...period, rows: period.rows.filter((row) => row.agentId === ids.a) })),
      });
    }
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: true }), errors = [];
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const path = new URL(route.request().url()).pathname;
      if (optionalRequests && route.request().method() === 'POST' && path.endsWith('/arena-matches')) {
        created = schemas.arenaLiveProtocolSchema.parse(route.request().postDataJSON());
        return route.fulfill({ json: { id: ids.match, state: 'draft' } });
      }
      if (openSeason && route.request().method() === 'POST' && path.endsWith('/arena-matches/' + ids.match + '/end')) {
        current = { ...current, state: 'ended', endedAt: '2026-11-12T18:00:00Z', sealedFrame: current.frames.at(-1) };
        return route.fulfill({ json: { id: ids.match, state: 'ended' } });
      }
      assert.equal(route.request().method(), 'GET');
      if (path.endsWith('/identity/context')) return route.fulfill({ json: { principal: { id: ids.a } } });
      if (path.endsWith('/ai/providers')) return route.fulfill({ json: optionalRequests ? providers : [] });
      if (path.includes('/watchlist')) return route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      if (path.endsWith('/arena-matches/' + ids.match)) return route.fulfill({ json: current });
      return route.fulfill({ status: 404, json: { message: '受控路径未登记' } });
    });
    await page.goto(origin + '/test/browser-arena-live-mobile.html?match=' + ids.match);
    await page.getByRole('heading', { name: '赛季累计收益', exact: true }).waitFor();
    if (unlimitedBudget) {
      await page.getByText(/剩余请求 不限额 · 剩余模型费用 不限额/).waitFor();
      assert.equal(await page.getByText(/剩余模型费用 0 USD/).count(), 0);
    }
    const frame = page.frameLocator('iframe[title="移动收益图表"]');
    await frame.locator('canvas').first().waitFor();
    await page.getByRole('button', { name: '隐藏 Atlas', exact: true }).click();
    await page.getByRole('button', { name: '显示 Atlas', exact: true }).click();
    await page.getByRole('radio', { name: '净值', exact: true }).click();
    await page.getByRole('heading', { name: '账户净值', exact: true }).waitFor();
    await page.getByRole('radio', { name: '近一周', exact: true }).click();
    await frame.locator('#chart').tap({ position: { x: 100, y: 100 } });
    await page.getByTestId('arena-chart-point').waitFor();
    await page.screenshot({ path: output + '/' + width + '-mobile-chart.png', fullPage: true });
    await page.getByRole('radio', { name: '成交', exact: true }).click();
    await page.getByRole('button', { name: '来源资料', exact: true }).click();
    await page.getByText(/受控浏览器样本/).waitFor();
    if (openSeason) {
      await page.getByText('运行中 · 手动启动 · 手动结束', { exact: true }).waitFor();
      await page.getByRole('button', { name: '结束并封存', exact: true }).click();
      await page.getByText('已结束 · 手动启动 · 手动结束', { exact: true }).waitFor();
    }
    if (unlimitedBudget) {
      await page.goto(origin + '/test/browser-arena-live-mobile.html?view=ArenaCreate');
      for (const key of ['requests', 'tokens', 'cost', 'allRequests', 'allTokens', 'allCost']) {
        const label = arenaLiveSetupFields.find(([name]) => name === key)[1];
        const field = page.getByRole('textbox', { name: label, exact: true }); await field.waitFor(); assert.equal(await field.inputValue(), '');
      }
      assert.equal(await page.getByRole('textbox', { name: '每次请求输入上限', exact: true }).inputValue(), '');
      assert.equal(await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).inputValue(), '');
      if (optionalRequests) {
        await page.getByRole('radio', { name: '全市场', exact: true }).click();
        if (inlineValidation) {
            await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
            const error = page.getByRole('alert').getByText('请选择参赛模型', { exact: true });
            await error.waitFor(); assert.equal(created, null);
            await error.scrollIntoViewIfNeeded();
            await page.screenshot({ path: output + '/' + width + '-mobile-model-error.png', fullPage: true });
        }
        for (const model of ['Atlas', 'Orion'].slice(0, singleModel ? 1 : 2)) {
          await page.getByRole('textbox', { name: '搜索参赛模型', exact: true }).fill(model);
          await page.getByRole('button', { name: '选择 ' + model + ' · 受控模型', exact: true }).click();
          assert.equal(await page.getByText('请选择参赛模型', { exact: true }).count(), 0);
        }
        for (const key of ['title', 'initialCash', 'maxPositionBps', 'buyBps', 'sellBps', 'minimum', 'slippageBps', ...arenaResourceFields.map(([key]) => key)]) {
          const label = [...arenaLiveSetupFields, ...arenaResourceFields].find(([name]) => name === key)[1];
          const field = page.getByRole('textbox', { name: label, exact: true });
          const placeholder = await field.getAttribute('placeholder');
          assert(['maxResearchSteps', 'maxCycleSeconds'].includes(key) ? placeholder === '不限制' : placeholder.startsWith('默认 ')); await field.fill('');
        }
        await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).fill('0');
        await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
        await page.getByRole('alert').getByText('请输入正整数，且不超过 2147483647', { exact: true }).waitFor(); assert.equal(created, null);
        if (inlineValidation) assert.equal(await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).getAttribute('aria-invalid'), 'true');
        await page.getByRole('textbox', { name: '每次请求输出上限', exact: true }).fill('');
        await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
        await page.getByRole('heading', { name: '赛季累计收益', exact: true }).waitFor();
        assert.equal(created.title, '自主模型比赛'); assert.equal(created.initialCash, '100000');
        assert.equal(created.entrants.length, singleModel ? 1 : 2);
        assert.equal(created.resources.maxCycleSeconds, null); assert.equal(created.resources.maxResearchSteps, null); assert.equal(created.decisionDeadlineMinutes, null);
        assert(created.entrants.every((e) => e.maxInputTokens === null && e.maxOutputTokens === null));
      }
      await page.screenshot({ path: output + '/' + width + '-mobile-budget-create.png', fullPage: true });
    }
    if (inlineValidation) {
      await page.goto(origin + '/test/browser-arena-live-mobile.html?view=ArenaDailyCreate');
      await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
      await page.getByRole('alert').getByText('请选择参赛模型', { exact: true }).waitFor();
      assert.equal(await page.getByRole('textbox', { name: '比赛名称', exact: true }).getAttribute('aria-invalid'), 'true');
      await page.screenshot({ path: output + '/' + width + '-mobile-daily-errors.png', fullPage: true });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, actualChartDocument: true, touchPoint: true, legend: true, metric: true, details: true, openSeason, unlimitedBudget, optionalRequests, inlineValidation, singleModel, errors: 0, nativeHost: false }));
    await page.close();
  }
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1);
  if (page) { await page.screenshot({ path: output + '/mobile-failure.png', fullPage: true }); console.log((await page.locator('body').innerText()).slice(0, 2500)); }
  throw error;
} finally { await browser.close(); }
