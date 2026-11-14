// 目标开发应用只读验收；仅转发指定比赛 GET，外壳账户使用受控空样本。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const target = 'http://127.0.0.1:3000';
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5173';
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-observation-runtime-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
let gets = 0;
try {
  const api = await browser.newContext();
  const response = await api.request.get(target + '/api/v1/arena-matches/catalog?kind=live&pageSize=25', { maxRetries: 0, maxRedirects: 0 });
  gets++;
  assert.equal(response.status(), 200);
  const catalog = await response.json();
  const match = process.env.ARENA_RUNTIME_MATCH_ID ? catalog.items.find((m) => m.id === process.env.ARENA_RUNTIME_MATCH_ID) : catalog.items.find((m) => m.state === 'running') ?? catalog.items[0];
  assert(match, '需要已有自主比赛');
  const base = '/api/v1/arena-matches/' + match.id;
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 } });
    const errors = [], rejected = []; let detail, localGets = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === 'GET' && url.pathname === '/api/v1/accounts') return route.fulfill({ json: [] });
      if (request.method() !== 'GET' || url.pathname !== base || gets >= 17) { rejected.push(request.method() + ' ' + url.pathname); await route.abort(); return; }
      gets++; localGets++;
      const result = await route.fetch({ url: target + base, maxRetries: 0, maxRedirects: 0 });
      assert.equal(result.status(), 200); detail = await result.json(); await route.fulfill({ response: result });
    });
    await page.goto(origin + '/arena/' + match.id);
    await page.getByRole('heading', { name: match.title, level: 1, exact: true }).waitFor();
    const chart = page.getByRole('img', { name: '各参赛模型的赛季累计收益和净值曲线', exact: true });
    assert.equal((await chart.boundingBox()).height, width >= 640 ? 520 : 420);
    await page.getByText('开始日期：' + (detail.protocol.startsOn ?? '手动启动'), { exact: true }).waitFor();
    if (width === 1440 && detail.state === 'running') {
      const before = localGets;
      await page.waitForResponse((r) => new URL(r.url()).pathname === base && r.request().method() === 'GET', { timeout: 20000 });
      assert(localGets > before, '实际应用自动刷新');
    }
    const ranking = page.locator('section').filter({ has: page.getByRole('heading', { name: '赛季排名', exact: true }) }).last();
    for (const agent of detail.agents) {
      const name = ranking.getByRole('button', { name: agent.model, exact: true });
      const layout = await name.evaluate((button) => {
        const style = getComputedStyle(button), provider = button.parentElement.querySelector('p');
        const range = document.createRange(); range.selectNodeContents(button);
        return { padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft],
          border: style.borderLeftWidth, textLeft: range.getBoundingClientRect().left, providerLeft: provider.getBoundingClientRect().left };
      });
      assert.deepEqual(layout.padding, ['0px', '0px', '0px', '0px']);
      assert.equal(layout.border, '0px');
      assert(Math.abs(layout.textLeft - layout.providerLeft) <= 1, '排名模型名与来源左边缘对齐');
      const legend = page.getByRole('button', { name: agent.model, exact: true }).first();
      assert.deepEqual(await legend.evaluate((button) => { const style = getComputedStyle(button); return [style.paddingLeft, style.paddingRight]; }), ['0px', '0px']);
      await name.hover();
      await name.focus();
      assert(await name.evaluate((button) => getComputedStyle(button).boxShadow !== 'none'), '保留键盘焦点反馈');
    }
    await ranking.getByRole('heading', { name: '赛季排名', exact: true }).click();
    await page.mouse.move(0, 0);
    await page.screenshot({ path: output + '/' + width + '-performance.png', fullPage: true });
    await ranking.getByRole('button', { name: detail.agents[0].model, exact: true }).click();
    await page.getByRole('tab', { name: '模型账户', exact: true, selected: true }).waitFor();
    await page.getByRole('tab', { name: '历史决策', exact: true }).click();
    await page.getByRole('heading', { name: '历史决策', level: 2, exact: true }).waitFor();
    const panel = page.getByRole('tabpanel', { name: '历史决策', exact: true });
    for (const agent of detail.agents) {
      await panel.getByRole('button').filter({ hasText: agent.model }).click();
      if (!agent.cycles.length) await panel.getByText('该模型在最近的研究记录中暂无历史决策。', { exact: true }).waitFor();
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: output + '/' + width + '-decisions.png', fullPage: true });
    await page.getByRole('tab', { name: '模型账户', exact: true }).click();
    await page.getByRole('button', { name: '查看历史决策', exact: true }).waitFor();
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByRole('heading', { name: '模型调用额度', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []); assert.deepEqual(rejected, []);
    console.log(JSON.stringify({ width, localGets, models: detail.agents.length, frames: detail.frames.length, recentCycles: detail.agents.reduce((n, a) => n + a.cycles.length, 0), fullShell: true, writes: 0 }));
    await page.close();
  }
  console.log(JSON.stringify({ gets, writes: 0, target }));
} finally { await browser.close(); }
