// 统一目录的受控浏览器验证；SQL、全集分页及权限由隔离 PostgreSQL 另行验证。
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs'), fixture = arenaLiveFixture(s);
const { arenaCatalogFixture } = require('../fixtures/arena-catalog.cjs');
const { universe, allowWebSearch, resources, ...common } = fixture.detail.protocol;
const historyId = '66666666-6666-4666-8666-666666666666';
const protocol = s.arenaProtocolSchema.parse({ ...common, version: 1, title: '历史日频比赛 · 独立账户收益比较',
  entrants: common.entrants.map((entry, index) => ({ ...entry, model: index ? 'Qwen' : 'Gemma' })),
  instruments: [{ instrumentId: fixture.ids.fill, symbol: 'AAPL.US', assetType: 'STOCK' }], benchmarks: ['cash', 'equal_weight_buy_hold'] });
const history = s.arenaSummarySchema.parse({ id: historyId, state: 'ended', protocol, createdAt: '2026-10-01T00:00:00Z' });
const roundId = '77777777-7777-4777-8777-777777777777';
const detail = s.arenaDetailSchema.parse({ ...history, remaining: protocol.budget, entrants: [], rounds: [
  { id: roundId, tradingDate: '2026-11-01', outcome: { state: 'sealed' } }] });
const report = s.arenaRoundReportSchema.parse({ id: roundId, arenaId: historyId, tradingDate: '2026-11-01',
  asOf: null, fingerprint: null, closeMarks: [], facts: [], entries: [] });
const comparison = s.arenaComparisonSchema.parse({ arenaId: historyId, start: protocol.startsOn, end: protocol.endsOn,
  currency: protocol.currency, planned: 0, opened: 0, rows: [] });
const seeded = [...fixture.list, ...Array.from({ length: 32 }, (_, index) => ({ ...fixture.list[0], id: randomUUID(),
  protocol: { ...fixture.detail.protocol, title: '自主比赛 ' + String(index + 1).padStart(2, '0'), market: ['CN', 'HK', 'US'][index % 3] },
  state: ['draft', 'running', 'paused', 'ended'][index % 4], createdAt: new Date(Date.UTC(2026, 10, 1, index)).toISOString() }))];
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187', output = process.env.ARENA_LIST_QA_OUTPUT ?? '/tmp/arena-live-catalog-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.ARENA_QA_CHANNEL ?? 'msedge' });
const pathOf = (request) => new URL(request.url()).pathname;
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], writes = [], requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    let liveRows = seeded, historyRows = [history], failure = false, gate;
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), path = pathOf(request);
      if (request.method() !== 'GET') { writes.push(path); await route.abort(); return; }
      if (path.endsWith('/arena-matches/catalog')) {
        const input = new URL(request.url()).searchParams; requests.push(Object.fromEntries(input));
        if (gate) await gate.promise;
        await route.fulfill(failure ? { status: 503, json: { message: '受控目录失败' } } :
          { json: arenaCatalogFixture(s, liveRows, historyRows, input) });
      } else if (path.endsWith('/arena-matches/' + fixture.ids.match)) await route.fulfill({ json: fixture.detail });
      else if (path.endsWith('/model-arenas/' + historyId)) await route.fulfill({ json: detail });
      else if (path.endsWith('/model-arenas/' + historyId + '/comparison')) await route.fulfill({ json: comparison });
      else if (path.endsWith('/model-arenas/' + historyId + '/rounds/' + roundId)) await route.fulfill({ json: report });
      else if (path.endsWith('/ai/providers')) await route.fulfill({ json: [] });
      else if (path.includes('watchlist')) await route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      else await route.fulfill({ status: 404, json: { message: '受控接口未登记' } });
    });
    const refresh = page.getByRole('button', { name: '刷新比赛', exact: true });
    const ready = async () => {
      await page.locator('button[aria-label="刷新比赛"][aria-busy="false"]').waitFor();
      const borders = await page.locator('main a.border-border, main button.border-border').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => {
        const style = getComputedStyle(node); return [style.borderTopWidth, style.borderTopStyle, style.borderTopColor];
      }));
      assert(borders.length > 0);
      assert(borders.every(([width, style, color]) => width === '1px' && style === 'solid' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(color)), '目录操作按钮边框保持可见');
    };
    const nextResponse = () => page.waitForResponse((response) => pathOf(response).endsWith('/arena-matches/catalog'));
    const act = async (action) => { const pending = nextResponse(); await action(); await pending; await ready(); };
    const goto = (path) => act(() => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent(path)));
    const choose = async (label, option) => {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      const optionElement = page.getByRole('option', { name: option, exact: true });
      await optionElement.waitFor({ state: 'visible' });
      const bounds = await page.locator('[data-slot="select-content"]').filter({ has: optionElement }).boundingBox();
      assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, label + ' 弹出框越界');
      await act(() => optionElement.click());
    };
    await goto('/arena?pageSize=10');
    assert.equal(await page.getByRole('combobox', { name: '排序', exact: true }).count(), 0);
    const searchBounds = await page.getByRole('searchbox', { name: '搜索比赛' }).boundingBox();
    const submitBounds = await page.getByRole('button', { name: '搜索', exact: true }).boundingBox();
    const createBounds = await page.getByRole('link', { name: '新建模拟比赛', exact: true }).boundingBox();
    assert(Math.abs(searchBounds.y - submitBounds.y) < 2 && submitBounds.x >= searchBounds.x + searchBounds.width);
    assert(Math.abs(createBounds.y - searchBounds.y) < 2 && createBounds.x > submitBounds.x + submitBounds.width,
      '新建应位于搜索同一行右侧');
    assert.equal(await page.getByRole('table').getByRole('row').count(), 11);
    assert.equal(await page.getByRole('link', { name: '历史比赛', exact: true }).count(), 0);
    assert.equal(await refresh.innerText(), '');
    gate = deferred();
    const refreshed = nextResponse();
    await refresh.click(); await page.getByRole('status', { name: '正在刷新比赛列表' }).waitFor();
    assert.equal(await page.getByRole('status', { name: '正在刷新比赛列表' }).count(), 1);
    assert.equal(await page.getByRole('table').getByRole('row').count(), 11);
    gate.resolve(); gate = undefined; await refreshed; await ready();
    failure = true; await act(() => refresh.click());
    await page.getByRole('alert').waitFor();
    assert.equal(await page.getByRole('table').getByRole('row').count(), 11);
    failure = false; await act(() => refresh.click());
    await act(() => page.getByRole('button', { name: '下一页', exact: true }).click());
    await page.getByText('第 2 / 4 页', { exact: true }).waitFor();
    await choose('市场', 'A股');
    assert.equal(requests.at(-1).page, '1');
    assert.equal(requests.at(-1).market, 'CN');
    await choose('状态', '已暂停');
    assert.equal(requests.at(-1).state, 'paused');
    assert.match(await page.getByRole('combobox', { name: '状态' }).innerText(), /已暂停/);
    await choose('类型', '日频比赛');
    await page.getByText('没有匹配的比赛', { exact: true }).waitFor();
    await act(() => page.getByRole('button', { name: '清空筛选', exact: true }).click());
    const search = page.getByRole('searchbox', { name: '搜索比赛' });
    const count = requests.length;
    await search.fill('Atlas'); assert.equal(requests.length, count, '关键词输入不应逐字请求');
    await act(() => search.press('Enter'));
    assert.equal(requests.at(-1).search, 'Atlas');
    await choose('市场', '美股');
    await choose('类型', '自主比赛');
    await choose('状态', '运行中');
    const current = page.getByRole('link', { name: fixture.detail.protocol.title, exact: true });
    await current.click();
    const back = page.getByRole('link', { name: '返回比赛列表', exact: true });
    const saved = new URL(await back.getAttribute('href'), origin);
    assert.equal(saved.searchParams.get('search'), 'Atlas'); assert.equal(saved.searchParams.get('state'), 'running');
    await act(() => back.click());
    assert.equal(await search.inputValue(), 'Atlas');
    assert.match(await page.getByRole('combobox', { name: '类型' }).innerText(), /自主比赛/);
    await page.getByRole('link', { name: '新建模拟比赛', exact: true }).click();
    assert.equal(new URL(await back.getAttribute('href'), origin).searchParams.get('state'), 'running');
    await act(() => back.click());
    await act(() => page.getByRole('button', { name: '清空筛选', exact: true }).click());
    await choose('类型', '日频比赛');
    const legacy = page.getByRole('link', { name: protocol.title, exact: true });
    assert.equal(await page.locator('tbody tr').first().getByRole('link').innerText(), protocol.title);
    await legacy.click();
    const legacyBack = page.getByRole('link', { name: '返回比赛列表', exact: true });
    assert.equal(new URL(await legacyBack.getAttribute('href'), origin).searchParams.get('kind'), 'history');
    await page.getByRole('tab', { name: '决策与成交', exact: true }).click();
    await page.getByRole('heading', { name: '该轮没有模型决策', exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { level: 1, name: protocol.title, exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '返回比赛', exact: true }).count(), 0);
    assert.equal(new URL(await legacyBack.getAttribute('href'), origin).searchParams.get('kind'), 'history');
    await act(() => legacyBack.click());
    await choose('每页', '50 条');
    assert.equal(requests.at(-1).pageSize, '50'); assert.equal(requests.at(-1).page, '1');
    await goto('/arena?page=1000000&pageSize=10');
    await page.getByText('第 4 / 4 页', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '下一页', exact: true }).isDisabled(), true);
    await goto('/arena/history?kind=history&pageSize=10');
    await legacy.waitFor();
    assert.match(await page.getByRole('combobox', { name: '类型' }).innerText(), /日频比赛/);
    await goto('/arena?state=invalid&kind=unknown&market=raw&page=-2&pageSize=10');
    assert.equal(requests.at(-1).state, 'all');
    assert.match(await page.getByRole('combobox', { name: '状态' }).innerText(), /全部状态/);
    await goto('/arena?sort=created_asc&pageSize=10');
    assert.equal(requests.at(-1).sort, 'created_desc');
    assert.equal(await page.locator('tbody tr').first().getByRole('link').innerText(), fixture.detail.protocol.title);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 页面横向溢出');
    await page.screenshot({ path: output + '/' + width + '-list.png', fullPage: true });
    await search.fill('不存在的比赛'); await act(() => search.press('Enter'));
    await page.getByText('没有匹配的比赛', { exact: true }).waitFor();
    await page.screenshot({ path: output + '/' + width + '-no-match.png', fullPage: true });
    liveRows = []; historyRows = []; await act(() => refresh.click());
    await page.getByText('暂无比赛', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-slot="empty"]').count(), 1);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ width, serverFilters: true, searchSubmit: true, chronologicalOrder: true, pagination: true,
      returnState: true, popupBounds: true, retainedOnFailure: true, empty: true, invalidUrl: true, errors: 0, writes: 0 }));
    await page.close();
  }
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1);
  if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true });
  throw error;
} finally { await browser.close(); }
