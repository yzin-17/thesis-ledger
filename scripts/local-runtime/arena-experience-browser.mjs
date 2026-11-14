// 完整消费流程的隔离验收；所有接口由受控响应接管，写入不发送到真实服务。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaRefreshFixture, ids } = require('../fixtures/arena-detail-refresh.cjs');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs');
const daily = arenaRefreshFixture(s), live = arenaLiveFixture(s);
const { arenaLiveSetupFields } = await import('../../packages/api-client/dist/index.js');
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-experience-qa';
await mkdir(output, { recursive: true });
const contract = { id: 'arena_live_research', version: 'arena-live-research-v2' };
const models = ['Gemma-controlled', 'Qwen-controlled'];
const providers = s.aiProviderRecordsSchema.parse([{ name: '受控模型来源', type: 'ai', enabled: true, priority: 1, capabilities: [], health: 'healthy',
  modelPricing: Object.fromEntries(models.map((model) => [model, { costPer1kInput: 0, costPer1kOutput: 0, costCurrency: 'USD' }])),
  executionRoutes: models.map((model) => ({ model, adapter: 'openai-compatible', mode: 'json_validated', contract, adapterEvidence: null,
    readiness: { state: 'blocked', reasons: ['budget_not_authorized'], configurationFingerprint: 'controlled', evaluatedAt: '2026-11-12T00:00:00Z' },
    liveValidation: { status: 'passed', checkedAt: '2026-11-12T00:00:00Z', requestId: ids.first } })) }]);
const report = s.arenaRoundReportSchema.parse({ ...daily.round, entries: daily.round.entries.map((e) => ({ ...e, state: 'decision', requestId: ids.first,
  decision: { actions: [{ symbol: '600000.SH', action: 'target', weightBps: 2000, reason: '受控决策依据与原始精度保持可读。', invalidatedBy: '受控失效条件', references: ['controlled-missing-reference'] }] },
  executionReasons: { '600000.SH': 'pending_execution' },
  fills: [{ symbol: '600000.SH', side: 'buy', quantity: '100', price: '10.123456', fee: '0.123456', sourceRef: 'controlled-source', executedAt: '2026-11-02T01:30:00Z' }] })) });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], unexpected = [], writes = [];
    let comparison = structuredClone(daily.comparison), created, createAttempts = 0, state = 'draft', failPause = true;
    comparison.rows[1].metrics.endNav = null; comparison.rows[1].metrics.returnRatio = null; comparison.rows[1].rank = null;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method();
      let body;
      if (method === 'POST' && path === '/api/v1/arena-matches') {
        created = request.postDataJSON(); writes.push({ path, body: created }); createAttempts++;
        if (createAttempts === 1) { await route.fulfill({ status: 503, json: { message: '受控保存失败' } }); return; }
        s.arenaLiveProtocolSchema.parse(created); body = { id: live.ids.match, state };
      } else if (method === 'POST' && path.startsWith('/api/v1/arena-matches/' + live.ids.match + '/')) {
        const action = path.split('/').at(-1); assert(['start', 'pause', 'end'].includes(action)); writes.push({ path });
        if (action === 'pause' && failPause) { failPause = false; await route.fulfill({ status: 503, json: { message: '受控暂停失败' } }); return; }
        state = { start: 'running', pause: 'paused', end: 'ended' }[action]; body = { id: live.ids.match, state };
      } else if (method !== 'GET') { unexpected.push(method + ' ' + path); await route.abort(); return; }
      else if (path === '/api/v1/ai/providers') body = providers;
      else if (path.includes('/watchlist')) body = { revision: 1, items: [], groups: [], nextOffset: null };
      else if (path === '/api/v1/model-arenas/calendar') body = { calendarId: 'controlled', calendarVersion: 'controlled-v1', timeZone: 'Asia/Shanghai' };
      else if (path === '/api/v1/arena-matches/' + live.ids.match) body = { ...live.detail, state, protocol: created ?? live.detail.protocol, sealedFrame: state === 'ended' ? live.detail.frames.at(-1) : null };
      else if (path === '/api/v1/model-arenas/' + ids.arena + '/rounds/' + ids.round) body = report;
      else if (path === '/api/v1/model-arenas/' + ids.arena + '/comparison') body = comparison;
      else if (path === '/api/v1/model-arenas/' + ids.arena) body = daily.detail;
      else { unexpected.push(method + ' ' + path); await route.abort(); return; }
      await route.fulfill({ json: body });
    });
    const goto = (path) => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent(path));
    const noOverflow = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 页面横向溢出');
      const frames = await page.locator('main section, main article, main aside, [data-slot="collapsible"], [data-slot="empty"]').evaluateAll((nodes) => nodes.filter((node) => {
        const style = getComputedStyle(node);
        return node.getClientRects().length && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((value) => parseFloat(value) > 0);
      }).map((node) => node.querySelector('h2,h3')?.textContent ?? node.getAttribute('data-slot')));
      assert.deepEqual(frames, [], '普通内容分组应通过标题与留白组织');
      const borders = await page.locator('main a.border-border, main button.border-border').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => {
        const style = getComputedStyle(node); return [style.borderTopWidth, style.borderTopStyle, style.borderTopColor];
      }));
      assert(borders.every(([width, style, color]) => width === '1px' && style === 'solid' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(color)), '操作按钮边框保持可见');
    };
    await goto('/arena/history/' + ids.arena);
    await page.getByRole('heading', { name: '模型与基准表现', exact: true }).waitFor();
    assert.equal(await page.locator('tbody tr').count(), 2);
    assert.equal(await page.getByRole('heading', { name: '模型账户', exact: true }).count(), 0);
    assert.match(await page.locator('tbody tr').nth(1).innerText(), /—/);
    await noOverflow(); await page.screenshot({ path: output + '/' + width + '-partial-performance.png', fullPage: true });
    comparison = { ...comparison, rows: comparison.rows.map((r) => ({ ...r, rank: null, metrics: { ...r.metrics, endNav: null, returnRatio: null } })) };
    await page.getByRole('button', { name: '刷新比赛详情', exact: true }).click();
    await page.getByRole('heading', { name: '尚无可比较的净值记录', exact: true }).waitFor();
    assert.equal(await page.getByRole('table').count(), 0);
    assert.equal(await page.getByRole('heading', { name: '模型账户', exact: true }).count(), 0);
    await noOverflow();
    await page.getByRole('button', { name: '查看模型账户', exact: true }).click();
    await page.getByText('模拟现金', { exact: true }).first().waitFor();
    assert.equal(await page.getByText('甲模型', { exact: true }).count(), 1);
    await noOverflow();
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByRole('heading', { name: '冻结赛制', exact: true }).waitFor();
    await page.getByRole('button', { name: '查看完整冻结协议', exact: true }).click();
    await noOverflow(); await page.screenshot({ path: output + '/' + width + '-settings.png', fullPage: true });
    await page.getByRole('tab', { name: '收益表现', exact: true }).click();
    await page.getByRole('button', { name: '查看决策与成交', exact: true }).click();
    const first = page.locator('article').first();
    await first.getByText('受控决策依据与原始精度保持可读。', { exact: true }).waitFor();
    await first.getByRole('button', { name: '依据资料 · 1 条', exact: true }).click();
    await first.getByText('未找到对应冻结资料 · controlled-missing-reference', { exact: true }).waitFor();
    await first.getByRole('cell', { name: '10.123456', exact: true }).waitFor();
    await first.getByRole('button', { name: '调用与执行资料', exact: true }).click();
    await first.getByText('请求编号：' + ids.first, { exact: true }).waitFor();
    await noOverflow(); await page.screenshot({ path: output + '/' + width + '-round-audit.png', fullPage: true });
    await goto('/arena/history/' + ids.arena + '/' + ids.round + '#model-' + ids.first);
    await page.locator('article').first().waitFor(); assert.equal(await page.locator('article').count(), 1);
    await page.getByRole('combobox', { name: '参赛模型', exact: true }).click();
    await page.getByRole('option', { name: '全部模型', exact: true }).click();
    await page.locator('article').nth(1).waitFor();
    assert.equal(await page.locator('article').count(), 2);
    await goto('/arena/new');
    await page.getByRole('heading', { level: 1, name: '新建比赛', exact: true }).waitFor();
    await noOverflow();
    await page.getByRole('button', { name: '全市场自主选股', exact: true }).click();
    const modelSearch = page.getByRole('combobox', { name: '搜索参赛模型', exact: true });
    for (const model of models) {
      await modelSearch.fill(model);
      await page.getByRole('option').filter({ hasText: model }).click();
    }
    await modelSearch.press('Escape');
    const values = { title: '受控创建与状态流转', startsOn: '2026-11-13', endsOn: '2026-11-20', initialCash: '999999999999.123456', minimum: '0.000001', cost: '0.000001', allCost: '0.000002' };
    for (const [key, value] of Object.entries(values)) {
      const label = arenaLiveSetupFields.find(([name]) => name === key)[1], input = page.getByRole('textbox', { name: label, exact: true });
      await input.fill(value); await input.press('Tab');
    }
    await page.getByRole('button', { name: '打开开始日期', exact: true }).click();
    const calendar = page.getByRole('dialog', { name: '选择日期和时间', exact: true });
    await calendar.waitFor();
    const calendarBounds = await calendar.boundingBox();
    assert(calendarBounds.x >= 0 && calendarBounds.x + calendarBounds.width <= width + 1, '日期面板不能超出页面');
    await page.keyboard.press('Escape'); await calendar.waitFor({ state: 'hidden' });
    await page.getByRole('switch', { name: '网页搜索', exact: true }).click();
    await page.getByRole('button', { name: '研究与行情观察设置', exact: true }).click();
    await page.getByRole('textbox', { name: '监测标的上限', exact: true }).fill('35');
    await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.equal(createAttempts, 1);
    assert.equal(await page.getByRole('textbox', { name: '比赛名称', exact: true }).inputValue(), values.title);
    await page.getByRole('button', { name: '保存比赛草稿', exact: true }).click();
    await page.getByRole('heading', { level: 1, name: values.title, exact: true }).waitFor();
    assert.equal(createAttempts, 2); assert.deepEqual(writes[0].body, writes[1].body);
    assert.equal(created.initialCash, values.initialCash); assert.equal(created.fees.minimum, values.minimum);
    assert.equal(created.budget.costMicros, 2); assert.equal(created.entrants[0].budget.costMicros, 1);
    assert.equal(created.resources.maxActiveSymbols, 35); assert.equal(created.allowWebSearch, true);
    const transition = async (label) => { const response = page.waitForResponse((r) => r.request().method() === 'POST'); await page.getByRole('button', { name: label, exact: true }).click(); await response; };
    await transition('启动比赛'); await page.getByRole('button', { name: '暂停比赛', exact: true }).waitFor();
    await transition('暂停比赛'); await page.getByRole('alert').waitFor(); assert.equal(state, 'running');
    await transition('暂停比赛'); await page.getByRole('button', { name: '恢复比赛', exact: true }).waitFor();
    await transition('恢复比赛'); await page.getByRole('button', { name: '暂停比赛', exact: true }).waitFor();
    await transition('暂停比赛'); await page.getByRole('button', { name: '结束比赛', exact: true }).waitFor();
    await transition('结束比赛'); await page.getByText('已结束', { exact: true }).waitFor();
    await noOverflow(); assert.deepEqual(errors, []); assert.deepEqual(unexpected, []);
    console.log(JSON.stringify({ width, partial: true, missing: true, references: true, fills: true, deepLink: true, precision: true, failedSaveRetained: true, transitions: true, controlledWrites: writes.length, realWrites: 0 }));
    await page.close();
  }
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
