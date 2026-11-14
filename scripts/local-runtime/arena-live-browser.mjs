import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const s = await import('../../packages/schemas/dist/index.js');
const { arenaLiveFixture } = require('../fixtures/arena-live.cjs'), fixture = arenaLiveFixture(s);
const { arenaCatalogFixture } = require('../fixtures/arena-catalog.cjs');
const directory = [['300058.SZ', '蓝色光标'], ['300059.SZ', '东方财富']].map(([symbol, displayName], index) => ({
  id: `00000000-0000-4000-8000-00000000000${index + 1}`, symbol, displayName,
  canonicalCode: symbol.split('.')[0], market: 'SZ', instrumentType: 'STOCK',
  active: true, confirmable: true, disabledReason: null, generation: 1,
}));
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187', output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-live-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.ARENA_QA_CHANNEL ?? 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [];
    page.on('pageerror', (e) => { errors.push(e.message); console.error(e.message); });
    const contentLayout = async () => {
      const frames = await page.locator('main section, main article, main aside, [data-slot="collapsible"], [data-slot="empty"]').evaluateAll((nodes) => nodes.filter((node) => {
        const style = getComputedStyle(node);
        return node.getClientRects().length && [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((value) => parseFloat(value) > 0);
      }).map((node) => node.querySelector('h2,h3')?.textContent ?? node.getAttribute('data-slot')));
      assert.deepEqual(frames, []);
      await page.waitForFunction(() => [...document.querySelectorAll('main a.border-border, main button.border-border')].filter((node) => node.getClientRects().length).every((node) => {
        const style = getComputedStyle(node);
        return style.borderTopWidth === '1px' && style.borderTopStyle === 'solid' && !['transparent', 'rgba(0, 0, 0, 0)'].includes(style.borderTopColor);
      }));
      const buttons = await page.locator('main a.border-border, main button.border-border').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => {
        const style = getComputedStyle(node);
        return { text: node.textContent, width: style.borderTopWidth, style: style.borderTopStyle, color: style.borderTopColor };
      }));
      assert(buttons.length > 0);
      const invalid = buttons.filter((border) => border.width !== '1px' || border.style !== 'solid' || ['transparent', 'rgba(0, 0, 0, 0)'].includes(border.color));
      assert.deepEqual(invalid, [], 'outline 操作应呈现真实边框');
    };
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body;
      if (path.endsWith('/instruments/search')) body = directory.filter((item) => `${item.displayName}${item.symbol}`.includes(new URL(route.request().url()).searchParams.get('q')));
      else if (path.endsWith('/arena-matches/catalog')) body = arenaCatalogFixture(s, fixture.list, [], new URL(route.request().url()).searchParams);
      else if (path.endsWith('/arena-matches/' + fixture.ids.match)) body = fixture.detail;
      else if (path.endsWith('/arena-matches')) body = fixture.list;
      else if (path.endsWith('/model-arenas')) body = [];
      else if (path.endsWith('/ai/providers')) body = [];
      else if (path.includes('watchlist')) body = { revision: 1, items: [], groups: [], nextOffset: null };
      else { await route.fulfill({ status: 404, json: { message: '受控接口未登记' } }); return; }
      await route.fulfill({ json: body });
    });
    await page.goto(origin + '/test/browser-arena-live.html?path=/arena/' + fixture.ids.match);
    await page.getByRole('heading', { name: '赛季累计收益' }).waitFor();
    await page.getByRole('button', { name: '隐藏 Atlas', exact: true }).click();
    await page.getByRole('button', { name: '显示 Atlas', exact: true }).click();
    await page.getByRole('button', { name: '查看净值', exact: true }).click();
    await page.getByRole('heading', { name: '账户净值', exact: true }).waitFor();
    await page.getByRole('button', { name: '近一周', exact: true }).click();
    await contentLayout();
    await page.screenshot({ path: output + '/' + width + '-performance.png', fullPage: true });
    const chart = page.locator('section').filter({ has: page.getByRole('heading', { name: '账户净值', exact: true }) }).last();
    await chart.getByRole('button', { name: 'Atlas', exact: true }).click();
    const accountTab = page.getByRole('tab', { name: '模型账户', exact: true });
    await page.getByRole('tabpanel', { name: '模型账户', exact: true }).waitFor();
    assert.equal(await accountTab.getAttribute('aria-selected'), 'true');
    assert(await accountTab.evaluate((element) => document.activeElement === element), '进入模型账户后焦点应可见');
    await page.getByRole('tab', { name: '收益表现', exact: true }).click();
    await page.getByRole('heading', { name: '账户净值', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: '近一周', exact: true }).getAttribute('aria-pressed'), 'true');
    if (width === 1440) {
      await page.evaluate(() => { document.documentElement.dataset.theme = 'dark'; document.documentElement.classList.add('dark'); document.documentElement.style.colorScheme = 'dark'; });
      await page.waitForFunction(() => getComputedStyle(document.body).backgroundColor === 'rgb(17, 20, 23)');
      await contentLayout();
      await page.screenshot({ path: output + '/1440-performance-dark.png', fullPage: true });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'light'; document.documentElement.classList.remove('dark'); document.documentElement.style.colorScheme = 'light'; });
    }
    await accountTab.click();
    await page.getByRole('tab', { name: '持仓', exact: true }).click();
    await page.getByRole('cell', { name: '苹果 · AAPL.US', exact: true }).waitFor();
    await page.getByRole('tab', { name: '成交', exact: true }).click();
    await page.getByText('来源资料', { exact: true }).click();
    await contentLayout();
    await page.screenshot({ path: output + '/' + width + '-match.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 页面横向溢出');
    await page.getByRole('link', { name: '返回比赛列表', exact: true }).click();
    await page.getByRole('link', { name: '新建模拟比赛', exact: true }).click();
    await page.getByRole('heading', { name: '赛制与预算', exact: true }).waitFor();
    await contentLayout();
    const back = page.getByRole('link', { name: '返回比赛列表', exact: true });
    const backBounds = await back.boundingBox();
    assert(backBounds && backBounds.width < 180, width + ' 返回按钮应按内容宽度显示');
    assert.equal(await back.getAttribute('href'), '/arena');
    const instrument = page.getByRole('combobox', { name: '搜索参赛标的', exact: true });
    for (const [index, item] of directory.entries()) {
      await instrument.fill(item.displayName);
      const option = page.getByRole('option').filter({ hasText: item.symbol });
      await option.waitFor();
      if (index === 0) await option.click();
      else { await instrument.press('ArrowDown'); await instrument.press('Enter'); }
      const remove = page.getByRole('button', { name: '移除 ' + item.displayName, exact: true });
      await remove.waitFor();
      assert.equal(await instrument.inputValue(), '', '选中标的后清空搜索');
      assert(await remove.evaluate((node) => Boolean(node.closest('[data-slot="combobox-chips"]'))), '标的回显位于输入框内');
      assert(await instrument.evaluate((node) => document.activeElement === node), '选中后保持输入焦点');
    }
    await page.locator('[data-slot="combobox-content"]').waitFor({ state: 'hidden' });
    await page.screenshot({ path: output + '/' + width + '-instrument-chips.png', fullPage: true });
    await instrument.fill('30005');
    const selectedOption = page.getByRole('option').filter({ hasText: '300058.SZ' });
    await selectedOption.waitFor();
    assert.equal(await selectedOption.getAttribute('aria-selected'), 'true', '已选标的仍可搜索并显示选中状态');
    await selectedOption.click();
    await page.getByRole('button', { name: '移除 蓝色光标', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(await instrument.inputValue(), '');
    await page.locator('[data-slot="combobox-content"]').waitFor({ state: 'hidden' });
    await instrument.fill('30005');
    const unselectedOption = page.getByRole('option').filter({ hasText: '300058.SZ' });
    await unselectedOption.waitFor();
    assert.equal(await unselectedOption.getAttribute('aria-selected'), 'false');
    await unselectedOption.click();
    await page.getByRole('button', { name: '移除 蓝色光标', exact: true }).waitFor();
    assert.equal(await page.locator('[data-slot="combobox-chip"]').count(), 2, '再次选中只恢复一项');
    assert.equal(await instrument.inputValue(), '');
    await page.getByRole('button', { name: '移除 蓝色光标', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: '移除 蓝色光标', exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: '移除 东方财富', exact: true }).count(), 1);
    const search = page.getByRole('switch', { name: '网页搜索', exact: true });
    assert.equal(await search.getAttribute('aria-checked'), 'false');
    await page.locator('section').filter({ has: search }).last().getByText('网页搜索', { exact: true }).click();
    assert.equal(await search.getAttribute('aria-checked'), 'false', '标签只说明，不触发开关');
    await search.click();
    assert.equal(await search.getAttribute('aria-checked'), 'true');
    await search.focus();
    await page.keyboard.press('Space');
    assert.equal(await search.getAttribute('aria-checked'), 'false');
    await page.getByRole('button', { name: '全市场自主选股', exact: true }).click();
    await page.screenshot({ path: output + '/' + width + '-setup.png', fullPage: true });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 创建页横向溢出');
    assert.deepEqual(errors, []);
    await back.click();
    await page.getByRole('link', { name: '新建模拟比赛', exact: true }).waitFor();
    console.log(JSON.stringify({ width, chart: true, legend: true, metric: true, interval: true, positions: true, fills: true, setup: true, back: true, searchSwitch: true, instrumentChips: true, errors: 0 }));
    await page.close();
  }
} catch (error) {
  const page = browser.contexts().at(-1)?.pages().at(-1);
  if (page) { await page.screenshot({ path: output + '/failure.png', fullPage: true }); console.log((await page.locator('body').innerText()).slice(0, 3000)); }
  throw error;
} finally { await browser.close(); }
