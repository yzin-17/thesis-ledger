// 比赛内记录导航、请求竞态及旧链接的隔离浏览器验收，所有接口由样本接管。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { ids, arenaRefreshFixture } = require('../fixtures/arena-detail-refresh.cjs');
const fixture = arenaRefreshFixture(s), latestId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const reports = new Map([[ids.round, '2026-11-02'], [latestId, '2026-11-03']].map(([id, day]) => [id, s.arenaRoundReportSchema.parse({
  ...fixture.round, id, tradingDate: day, entries: fixture.round.entries.map((e) => ({ ...e, state: 'decision', decision: { actions: [{
    symbol: '600000.SH', action: 'observe', reason: day + ' 受控决策', invalidatedBy: '受控失效条件', references: ['controlled-ref'],
  }] } })),
})]));
const detail = { ...fixture.detail, rounds: [...reports.values()].reverse().map((r) => ({ id: r.id, tradingDate: r.tradingDate, outcome: { state: 'sealed' } })) };
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-inline-navigation-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], writes = [], roundRequests = [];
    let hold, release, fail = false, empty = false;
    page.on('pageerror', (e) => errors.push(e.message));
    const base = '/api/v1/model-arenas/' + ids.arena, path = '/arena/history/' + ids.arena;
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET') { writes.push(url.pathname); await route.abort(); return; }
      let body;
      if (url.pathname === base) body = empty ? { ...detail, rounds: [] } : detail;
      else if (url.pathname === base + '/comparison') body = fixture.comparison;
      else if (url.pathname.startsWith(base + '/rounds/')) {
        const id = url.pathname.split('/').at(-1); roundRequests.push(id);
        if (id === ids.round && hold) await hold;
        if (fail) { await route.fulfill({ status: 503, json: { message: '受控记录失败' } }); return; }
        body = reports.get(id);
      }
      if (!body) { await route.fulfill({ status: 404, json: { message: '受控记录不存在' } }); return; }
      try { await route.fulfill({ json: body }); } catch (e) { if (!request.failure()) throw e; }
    });
    const goto = (route) => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent(route));
    const ready = () => page.locator('button[aria-label="刷新比赛详情"][aria-busy="false"]').waitFor();
    const current = () => page.evaluate(() => window.arenaLiveLocation());
    const waitDay = async (day) => { await page.locator('article').first().getByText(day + ' 受控决策', { exact: true }).waitFor(); await ready(); };
    const choose = async (label, option) => {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      const item = page.getByRole('option', { name: option, exact: true }); await item.waitFor();
      const box = await page.locator('[data-slot="select-content"]').filter({ has: item }).boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      await item.click();
    };
    await goto(path + '?view=accounts'); await ready();
    await page.getByRole('button', { name: '查看最近决策', exact: true }).first().click(); await waitDay('2026-11-03');
    let url = new URL(await current(), origin);
    assert.equal(url.pathname, path); assert.equal(url.searchParams.get('round'), latestId); assert.equal(url.searchParams.get('model'), ids.first);
    assert.equal(await page.locator('article').count(), 1);
    assert.equal(await page.getByRole('heading', { level: 1, name: detail.protocol.title, exact: true }).count(), 1);
    assert.equal(await page.getByRole('link', { name: '返回比赛', exact: true }).count(), 0);
    const before = roundRequests.length;
    await choose('参赛模型', '全部模型'); await page.locator('article').nth(1).waitFor(); assert.equal(await page.locator('article').count(), 2); assert.equal(roundRequests.length, before);
    await choose('交易日期', '2026-11-02'); await waitDay('2026-11-02');
    await page.evaluate(() => window.arenaLiveHistory(-1)); await waitDay('2026-11-03');
    assert.equal(new URL(await current(), origin).searchParams.has('model'), false);
    await page.evaluate(() => window.arenaLiveHistory(1)); await waitDay('2026-11-02');
    const saved = await current(); await goto(saved); await waitDay('2026-11-02');
    await page.screenshot({ path: output + '/' + width + '-records.png', fullPage: true });
    await goto(path + '/' + latestId + '#model-' + ids.second); await waitDay('2026-11-03');
    url = new URL(await current(), origin); assert.equal(url.pathname, path); assert.equal(url.hash, ''); assert.equal(url.searchParams.get('model'), ids.second);
    assert.equal(await page.locator('article').count(), 1);
    hold = new Promise((resolve) => { release = resolve; });
    const pending = page.waitForRequest((r) => new URL(r.url()).pathname === base + '/rounds/' + ids.round);
    await choose('交易日期', '2026-11-02'); await pending;
    await page.getByRole('status', { name: '正在读取决策与成交', exact: true }).waitFor();
    await choose('交易日期', '2026-11-03'); await waitDay('2026-11-03');
    release(); hold = null; await page.unrouteAll({ behavior: 'wait' });
    assert.equal(await page.locator('article').getByText('2026-11-02 受控决策', { exact: true }).count(), 0);
    // 后续使用原路由处理器，保持全部读取仍由样本接管。
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const p = new URL(route.request().url()).pathname;
      if (route.request().method() !== 'GET') { writes.push(p); await route.abort(); return; }
      let body = p === base ? (empty ? { ...detail, rounds: [] } : detail) : reports.get(p.split('/').at(-1));
      if (p === base + '/comparison') body = fixture.comparison;
      if (p.includes('/rounds/')) { roundRequests.push(p.split('/').at(-1)); if (fail) { await route.fulfill({ status: 503, json: { message: '受控读取失败' } }); return; } }
      await route.fulfill({ status: body ? 200 : 404, json: body ?? { message: '不存在' } });
    });
    fail = true; await choose('交易日期', '2026-11-02'); await page.getByRole('alert').waitFor();
    fail = false; await page.getByRole('button', { name: '重试读取记录', exact: true }).click(); await waitDay('2026-11-02');
    await goto(path + '?view=activity&round=invalid'); await page.getByRole('heading', { name: '记录链接无效', exact: true }).waitFor();
    await page.getByRole('button', { name: '重新选择记录', exact: true }).click(); await waitDay('2026-11-03');
    assert.equal(new URL(await current(), origin).searchParams.get('round'), latestId);
    empty = true; await goto(path + '?view=activity'); await page.getByRole('heading', { name: '尚无决策与成交记录', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ width, inMatch: true, latestModel: true, dateFilter: true, modelReusesRead: true, backForward: true, reload: true, legacy: true, staleResponseIgnored: true, retry: true, invalid: true, empty: true, realWrites: 0 }));
    await page.close();
  }
} catch (e) {
  const page = browser.contexts().at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true });
  throw e;
} finally { await browser.close(); }
