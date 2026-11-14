// 真实组件配受控接口；仅测试宿主注入图表读数，不修改产品运行时代码。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs');
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187';
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-observation-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const fixture = arenaLiveFixture(s), detail = fixture.detail, errors = [], writes = [];
    const now = Date.parse(detail.frames.at(-1).at) + 30000;
    await page.clock.install({ time: now });
    let reads = 0, failure = false, release;
    detail.agents[0].model = 'qwen3.6–35b–a3b–uncensored–hauhaucs–aggressive@q4_k_m';
    detail.protocol.entrants[0].model = detail.agents[0].model;
    detail.agents[0].cycles = Array.from({ length: 12 }, (_, i) => ({ ...detail.agents[0].cycles[0], id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
      createdAt: new Date(now - i * 60000).toISOString(), decision: { ...detail.agents[0].cycles[0].decision, summary: '历史研究 ' + (i + 1) } }));
    page.on('pageerror', (error) => { errors.push(error.message); console.error(error.message); });
    await page.route((url) => url.pathname.endsWith('/ArenaLiveChart.tsx'), async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('instance.current = chart;', 'instance.current = chart; window.__arenaChart = chart;');
      await route.fulfill({ response, body });
    });
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() !== 'GET') { writes.push(path); await route.abort(); return; }
      if (path === '/api/v1/arena-matches/' + fixture.ids.match) {
        reads++;
        if (release) await new Promise((resolve) => { release.resolve = resolve; });
        if (failure) return route.fulfill({ status: 503, json: { message: '受控读取失败' } });
        return route.fulfill({ json: detail });
      }
      if (path.includes('watchlist')) return route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      throw new Error('未登记的请求 ' + path);
    });
    const goto = (path) => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent(path));
    const currentRange = () => page.evaluate(() => window.__arenaChart.timeScale().getVisibleRange());
    const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 横向溢出');
    await goto('/arena/' + fixture.ids.match);
    await page.getByRole('heading', { name: '赛季累计收益', exact: true }).waitFor();
    await page.waitForFunction(() => window.__arenaChart?.timeScale().getVisibleRange());
    const chart = page.getByRole('img', { name: '各参赛模型的赛季累计收益和净值曲线', exact: true });
    assert.equal((await chart.boundingBox()).height, width >= 640 ? 520 : 420);
    let range = await currentRange();
    assert.equal(range.to, Math.floor(now / 1000), '默认定位当前时刻');
    const firstAt = Math.floor(Date.parse(detail.frames[0].at) / 1000);
    assert.equal(range.from, firstAt, '全部保留首个真实估值');
    await page.clock.runFor(15010);
    await page.waitForFunction(() => document.querySelector('button[aria-label="刷新比赛"]')?.getAttribute('aria-busy') === 'false');
    assert(reads >= 2, '运行时自动读取');
    range = await currentRange();
    assert.equal(range.to, Math.floor(now / 1000) + 15, '无新估值时只扩展时间轴');
    assert.equal(range.from, firstAt, '自动跟随不裁掉全部视图的起点');
    const history = { from: Math.floor(Date.parse(detail.frames[10].at) / 1000), to: Math.floor(Date.parse(detail.frames[70].at) / 1000) };
    await page.evaluate((value) => window.__arenaChart.timeScale().setVisibleRange(value), history);
    await page.waitForFunction((value) => window.__arenaChart.timeScale().getVisibleRange()?.to === value.to, history);
    const nextFrame = structuredClone(detail.frames.at(-1));
    nextFrame.at = new Date(now + 30000).toISOString(); nextFrame.marketTime = nextFrame.at;
    detail.frames.push(nextFrame);
    await page.clock.runFor(15010);
    assert.deepEqual(await currentRange(), history, '刷新保留历史视窗');
    await page.getByRole('button', { name: '回到最新', exact: true }).click();
    await page.waitForFunction((at) => window.__arenaChart.timeScale().getVisibleRange().to >= at, Math.floor(now / 1000) + 30);
    await page.getByRole('button', { name: '全部', exact: true }).click();
    await page.evaluate(() => window.__arenaChart.timeScale().fitContent());
    await chart.scrollIntoViewIfNeeded();
    const box = await chart.boundingBox();
    await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.45);
    await page.getByRole('status').filter({ hasText: detail.agents[0].model }).waitFor();
    const tooltip = page.getByRole('status').filter({ hasText: detail.agents[0].model });
    const bounds = await tooltip.boundingBox();
    assert(bounds.y >= box.y && bounds.y + bounds.height <= box.y + box.height && bounds.x >= box.x && bounds.x + bounds.width <= box.x + box.width, '读数位于图内');
    await page.screenshot({ path: output + '/' + width + '-chart.png', fullPage: true });
    await page.mouse.move(0, 0); await tooltip.waitFor({ state: 'hidden' });
    const modelButtons = page.getByRole('button', { name: detail.agents[0].model, exact: true });
    assert(await modelButtons.evaluateAll((nodes) => nodes.every((node) => ['rgba(0, 0, 0, 0)', 'transparent'].includes(getComputedStyle(node).borderColor))), '模型名无描边');
    release = {};
    const refresh = page.getByRole('button', { name: '刷新比赛', exact: true });
    await refresh.click();
    await page.locator('[data-slot="list-refresh"]').waitFor();
    assert.equal(await page.locator('[data-slot="list-refresh"]').count(), 1);
    assert.equal(await chart.count(), 1);
    failure = true; release.resolve(); release = null;
    await page.getByRole('alert').waitFor();
    assert.equal(await chart.count(), 1, '失败保留旧图');
    failure = false; await refresh.click(); await page.getByRole('alert').waitFor({ state: 'hidden' });
    await page.getByRole('tab', { name: '历史决策', exact: true }).click();
    await page.getByText('历史研究 1', { exact: true }).waitFor();
    assert.equal(await page.locator('article').count(), 10);
    await page.getByRole('button', { name: '下一页', exact: true }).click();
    await page.getByText('历史研究 11', { exact: true }).waitFor();
    assert.equal(await page.locator('article').count(), 2);
    assert.match(await page.evaluate(() => window.arenaLiveLocation()), /decisionPage=2/);
    const path = await page.evaluate(() => window.arenaLiveLocation());
    await goto(path); await page.getByText('历史研究 11', { exact: true }).waitFor();
    const panel = page.getByRole('tabpanel', { name: '历史决策', exact: true });
    await panel.getByRole('button').filter({ hasText: 'Orion' }).click();
    await page.getByText('估值仍在合理范围', { exact: false }).waitFor();
    await page.evaluate(() => window.arenaLiveHistory(-1));
    await page.getByText('历史研究 11', { exact: true }).waitFor();
    await noOverflow(); await page.screenshot({ path: output + '/' + width + '-decisions.png', fullPage: true });
    await page.getByRole('tab', { name: '模型账户', exact: true }).click();
    await page.getByRole('button', { name: '查看历史决策', exact: true }).click();
    await page.getByRole('tabpanel', { name: '历史决策', exact: true }).waitFor();
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByRole('heading', { name: '模型调用额度', exact: true }).waitFor(); await noOverflow();
    detail.agents[0].cycles = [];
    detail.state = 'paused';
    await goto('/arena/' + fixture.ids.match + '?view=decisions&model=' + fixture.ids.a);
    await page.getByText('该模型在最近的研究记录中暂无历史决策。', { exact: true }).waitFor();
    await page.getByRole('tab', { name: '收益表现', exact: true }).click();
    await page.getByText('开始日期：2026-11-01', { exact: true }).waitFor();
    await page.waitForFunction(() => window.__arenaChart?.timeScale().getVisibleRange());
    assert.equal((await currentRange()).to, Math.floor(Date.parse(detail.frames.at(-1).at) / 1000));
    const pausedReads = reads; await page.clock.runFor(30010); assert.equal(reads, pausedReads);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log(JSON.stringify({ width, autoRefresh: true, followNow: true, historyViewport: true, tooltipInside: true, refreshFailureRecovery: true, historyPagination: true, urlReloadAndBack: true, paused: true, writes: 0 }));
    await page.close();
  }
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1);
  if (page) { await page.screenshot({ path: output + '/failure.png', fullPage: true }); console.log((await page.locator('body').innerText()).slice(0, 2000)); }
  throw error;
} finally { await browser.close(); }
