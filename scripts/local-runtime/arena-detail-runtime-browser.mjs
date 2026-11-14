// 使用真实本地比赛的只读资料检查消费页面；不改变比赛、不读取外部来源。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187';
const fullShell = process.env.ARENA_RUNTIME_FULL_SHELL === '1';
const target = process.env.ARENA_CATALOG_API_ORIGIN ?? 'http://127.0.0.1:3000';
assert(['http://127.0.0.1:3000', 'http://localhost:3000'].includes(target));
const output = process.env.ARENA_RUNTIME_QA_OUTPUT ?? '/tmp/arena-detail-runtime-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
let totalGets = 0;
try {
  const api = await browser.newContext();
  const response = await api.request.get(target + '/api/v1/arena-matches/catalog?kind=history&pageSize=25', { maxRetries: 0, maxRedirects: 0 });
  totalGets++;
  assert.equal(response.status(), 200);
  const catalog = await response.json(), match = catalog.items.find((m) => m.state === 'ended');
  assert(match, '需要已有的已结束日频比赛');
  const base = '/api/v1/model-arenas/' + match.id;
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], rejected = [];
    let detail, roundGets = 0, localGets = 0, shellReads = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (fullShell && request.method() === 'GET' && url.pathname === '/api/v1/accounts') {
        shellReads++; await route.fulfill({ json: [] }); return;
      }
      const allowed = url.pathname === base || url.pathname === base + '/comparison' || detail?.rounds.some((r) => url.pathname === base + '/rounds/' + r.id);
      if (request.method() !== 'GET' || !allowed || localGets >= 6 || totalGets >= 25) { rejected.push(url.pathname); await route.abort(); return; }
      localGets++; totalGets++;
      const result = await route.fetch({ url: target + url.pathname + url.search, maxRetries: 0, maxRedirects: 0 });
      assert.equal(result.status(), 200);
      if (url.pathname === base) detail = await result.json();
      if (url.pathname.includes('/rounds/')) roundGets++;
      await route.fulfill({ response: result });
    });
    await page.goto(origin + (fullShell ? '/arena/history/' : '/test/browser-arena-live.html?path=/arena/history/') + match.id);
    await page.getByRole('heading', { level: 1, name: match.title, exact: true }).waitFor();
    await page.locator('button[aria-label="刷新比赛详情"][aria-busy="false"]').waitFor();
    assert.equal(await page.getByRole('heading', { level: 1 }).count(), 1);
    assert.equal(await page.getByText('资料不足', { exact: true }).count(), 0);
    assert.equal(await page.getByRole('heading', { name: '模型账户', exact: true }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: output + '/' + width + '-performance.png', fullPage: true });
    await page.getByRole('tab', { name: '模型账户', exact: true }).click();
    await page.getByRole('button', { name: '查看最近决策', exact: true }).first().waitFor();
    const accountActions = await page.getByRole('button', { name: '查看最近决策', exact: true }).evaluateAll((nodes) => nodes.map((node) => {
      const style = getComputedStyle(node);
      return { width: style.borderTopWidth, style: style.borderTopStyle, color: style.borderTopColor };
    }));
    assert(accountActions.length > 0);
    assert(accountActions.every((border) => border.width === '1px' && border.style === 'solid' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(border.color)), '账户操作链接应呈现真实边框');
    await page.screenshot({ path: output + '/' + width + '-accounts.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('tab', { name: '比赛设置', exact: true }).click();
    await page.getByRole('heading', { name: '模型调用额度', exact: true }).waitFor();
    const settingsPanel = page.getByRole('tabpanel', { name: '比赛设置', exact: true });
    const sectionEdges = await settingsPanel.locator('[data-slot="separator"]').evaluateAll((nodes) => nodes.map((node) => {
      const box = node.getBoundingClientRect(); return { x: box.x, right: box.right, width: box.width, height: box.height };
    }));
    const panelBounds = await settingsPanel.boundingBox();
    assert.equal(sectionEdges.length, 3);
    assert(sectionEdges.every((line) => line.height >= 0.5 && line.height <= 1.5 && Math.abs(line.x - panelBounds.x) <= 1 && Math.abs(line.right - panelBounds.x - panelBounds.width) <= 1), '模块分隔线与内容边缘对齐');
    const disclosure = page.getByRole('button', { name: '查看完整冻结协议', exact: true });
    await disclosure.hover();
    const disclosureStyle = await disclosure.evaluate((node) => {
      const style = getComputedStyle(node);
      return { height: node.getBoundingClientRect().height, x: node.getBoundingClientRect().x, right: node.getBoundingClientRect().right, paddingX: parseFloat(style.paddingLeft), paddingY: parseFloat(style.paddingTop) };
    });
    assert(disclosureStyle.height >= 40 && disclosureStyle.paddingX >= 8 && disclosureStyle.paddingY >= 8);
    assert(disclosureStyle.x >= 0 && disclosureStyle.right <= width + 1);
    await page.screenshot({ path: output + '/' + width + '-settings-hover.png', fullPage: true, animations: 'disabled' });
    await disclosure.click();
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
    await disclosure.press('Space');
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'false');
    await disclosure.press('Enter');
    assert.equal(await disclosure.getAttribute('aria-expanded'), 'true');
    const groups = await page.locator('[role="tabpanel"] section, [role="tabpanel"] [data-slot="collapsible"]').evaluateAll((nodes) => nodes.filter((node) => {
      const style = getComputedStyle(node);
      return node.getClientRects().length && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((value) => parseFloat(value) > 0);
    }).map((node) => node.textContent?.slice(0, 30)));
    assert.deepEqual(groups, []);
    await page.screenshot({ path: output + '/' + width + '-settings.png', fullPage: true });
    await page.getByRole('tab', { name: '决策与成交', exact: true }).click();
    assert(detail.rounds.length > 0, '此验收需要已有轮次');
    await page.getByRole('combobox', { name: '交易日期', exact: true }).waitFor();
    await page.locator('article').first().waitFor();
    await page.locator('button[aria-label="刷新比赛详情"][aria-busy="false"]').waitFor();
    assert.equal(roundGets, 1);
    await page.screenshot({ path: output + '/' + width + '-round.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.getByRole('tab', { name: '收益表现', exact: true }).click();
    await page.getByRole('tabpanel', { name: '收益表现', exact: true }).waitFor();
    await page.getByRole('heading', { level: 1, name: match.title, exact: true }).waitFor();
    await page.locator('button[aria-label="刷新比赛详情"][aria-busy="false"]').waitFor();
    await page.unrouteAll({ behavior: 'wait' });
    assert.deepEqual(errors, []); assert.deepEqual(rejected, []);
    console.log(JSON.stringify({ width, fullShell, shellFixtureReads: shellReads, localGets, roundGets, singleHeading: true, tabs: true, longModels: true, back: true, businessWrites: 0, sourceReads: 0, modelCalls: 0 }));
    await page.close();
  }
  console.log(JSON.stringify({ totalGets, target, writes: 0 }));
} finally { await browser.close(); }
