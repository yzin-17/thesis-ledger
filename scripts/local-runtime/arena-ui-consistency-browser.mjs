// 竞技场各阅读入口的一致性验收；所有业务接口由受控样本接管。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaRefreshFixture, ids } = require('../fixtures/arena-detail-refresh.cjs');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs');
const daily = arenaRefreshFixture(s), live = arenaLiveFixture(s);
daily.weekly = s.arenaWeekDetailSchema.parse({ ...daily.weekly, report: { ...daily.weekly.report,
  attribution: [{ entrantId: ids.first, symbols: [{ symbol: '600000.SH', amount: '100.123456' }], fees: '0.000001', residual: null }],
  divergences: [{ roundId: ids.round, day: '2026-11-02', symbol: '600000.SH', spreadBps: '1000', lowest: ids.first, highest: ids.second }],
  fills: [{ id: ids.first, entrantId: ids.first, roundId: ids.round, symbol: '600000.SH', side: 'buy', quantity: '100.000001', price: '10.123456', fee: '0.000001', executedAt: '2026-11-02T01:30:00Z', sourceRef: 'controlled' }],
} });
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5173', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-ui-consistency-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 }, reducedMotion: 'reduce' }), errors = [], writes = [];
    let fail = false, empty = false;
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') { writes.push(path); await route.abort(); return; }
      if (path.includes('/model-weeklies') && fail) { await route.fulfill({ status: 503, json: { message: '受控读取失败' } }); return; }
      let body = daily.response(new URL(request.url()));
      if (path.endsWith('/model-weeklies/' + ids.arena + '/' + ids.week)) body = daily.weekly;
      if (path === '/api/v1/arena-matches/' + live.ids.match) body = live.detail;
      if (path === '/api/v1/ai/providers') body = [];
      if (path.includes('/watchlist')) body = { revision: 1, items: [], groups: [], nextOffset: null };
      if (path.includes('/model-weeklies') && !path.endsWith('/' + ids.week)) body = empty ? [] : daily.weeklies;
      await route.fulfill({ status: body ? 200 : 404, json: body ?? { message: '受控接口未登记' } });
    });
    const goto = (path) => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent(path));
    const bounds = async () => {
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '页面不可横向溢出');
      assert.equal(await page.locator('main > section h1').count(), 1, '阅读页只保留一个主标题');
      const frames = await page.locator('main section, main article').evaluateAll((nodes) => nodes.filter((n) => n.getClientRects().length && ['borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth'].some((key) => parseFloat(getComputedStyle(n)[key]) > 0)).length);
      assert.equal(frames, 0, '内容分组不用线框');
    };
    for (const path of ['/arena/new', '/arena/history/new']) {
      await goto(path);
      await page.getByRole('textbox', { name: '开始日期', exact: true }).waitFor();
      assert.equal(await page.getByText(/YYYY-MM-DD/).count(), 0);
      await page.getByRole('textbox', { name: '结束日期', exact: true }).fill('2026-11-20');
      await page.getByRole('button', { name: '打开开始日期', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: '选择日期和时间', exact: true }); await dialog.waitFor();
      const box = await dialog.boundingBox(); assert(box.x >= 0 && box.x + box.width <= width + 1);
      await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' }); await bounds();
    }
    await goto('/arena/' + live.ids.match);
    await page.getByRole('heading', { name: '赛季排名', exact: true }).waitFor(); await bounds();
    await page.getByRole('tab', { name: '模型账户', exact: true }).click();
    await page.getByRole('heading', { level: 2, name: 'Atlas', exact: true }).waitFor();
    await page.getByRole('button', { name: '调用与资料审计', exact: true }).click();
    await page.getByText(/inputTokens/).waitFor();
    for (const tab of ['持仓', '委托', '成交', '研究与预约']) {
      await page.getByRole('tab', { name: tab, exact: true }).click(); await bounds();
      if (tab === '成交') { await page.getByRole('button', { name: '来源资料', exact: true }).click(); await page.getByText(/受控浏览器样本/).waitFor(); }
    }
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByText('令牌总额度', { exact: true }).waitFor(); await bounds();
    await page.screenshot({ path: output + '/' + width + '-live-settings.png', fullPage: true });
    await goto('/arena/history/' + ids.arena);
    await page.getByRole('tab', { name: '模型账户', exact: true }).click();
    await page.getByRole('heading', { level: 2, name: '甲模型', exact: true }).waitFor(); await bounds();
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByRole('link', { name: '模型周报', exact: true }).click();
    await page.getByRole('link', { name: '返回比赛', exact: true }).waitFor(); await bounds();
    await page.screenshot({ path: output + '/' + width + '-weekly-list.png', fullPage: true });
    const weekly = page.getByRole('link').filter({ hasText: daily.weekly.title }); await weekly.click();
    await page.getByRole('heading', { name: '本周决策', exact: true }).waitFor(); await bounds();
    await page.getByRole('cell', { name: '100.000001', exact: true }).waitFor();
    assert.equal(await page.getByRole('table').count(), 2);
    assert(!/T\d{2}:.*Z/.test(await page.getByRole('table').nth(1).innerText()));
    await page.getByRole('button', { name: '决策后的价格观察 · 1 条', exact: true }).click();
    await page.getByText(/5 个交易日/).waitFor();
    await page.getByRole('button', { name: '决策后收录的标的资讯', exact: true }).click();
    await page.getByText(/受控后来资讯 10/).waitFor();
    await page.screenshot({ path: output + '/' + width + '-weekly-detail.png', fullPage: true });
    const link = page.getByRole('link').filter({ hasText: /^甲模型/ });
    assert.match(await link.getAttribute('href'), /view=activity&round=.*&model=/); await link.click();
    await page.getByRole('tab', { name: '决策与成交', selected: true }).waitFor();
    await page.getByRole('link', { name: '返回来源页', exact: true }).click();
    await page.getByRole('heading', { name: '本周决策', exact: true }).waitFor();
    fail = true; await page.getByRole('button', { name: '刷新模型周报', exact: true }).click();
    await page.getByRole('alert').waitFor(); assert.equal(await page.getByRole('heading', { name: '本周决策', exact: true }).count(), 1);
    fail = false; await page.getByRole('button', { name: '重新读取周报', exact: true }).click(); await page.getByRole('alert').waitFor({ state: 'hidden' });
    await page.getByRole('link', { name: '返回周报列表', exact: true }).click();
    await page.getByRole('link', { name: '返回比赛', exact: true }).click();
    await page.getByRole('tab', { name: '比赛设置', selected: true }).waitFor();
    empty = true; await goto('/journal/model-weeklies/' + ids.arena);
    await page.getByRole('heading', { name: '暂无已发布的周报', exact: true }).waitFor(); await bounds();
    assert.deepEqual(writes, []); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, creation: 2, liveTabs: 3, accountTabs: 4, weekly: true, sourceReturn: true, failedRefreshRetains: true, empty: true, realRequests: 0 }));
    await page.close();
  }
} catch (e) {
  const page = browser.contexts().at(-1)?.pages().at(-1); if (page) await page.screenshot({ path: output + '/failure.png', fullPage: true }); throw e;
} finally { await browser.close(); }
