// 独立模拟数据覆盖实际页面；所有业务接口只允许受控 GET。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { protectionBrowserFixture } from '../fixtures/arena-contingent-orders.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5196';
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-contingent-orders-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.ARENA_QA_CHANNEL ?? 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const fixture = protectionBrowserFixture(), errors = [];
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      assert.equal(route.request().method(), 'GET');
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/arena-matches/' + fixture.ids.match)) return route.fulfill({ json: fixture.detail });
      if (path.includes('/watchlist')) return route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      return route.fulfill({ json: [] });
    });
    const navigate = async (view, model = fixture.ids.a) => page.goto(origin + '/test/browser-arena-live.html?path=' + encodeURIComponent('/arena/' + fixture.ids.match + '?view=' + view + '&model=' + model));
    const noOverflow = async () => assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), width + ' 页面溢出');
    await navigate('decisions');
    await page.getByText(/全部成交后，自动为本批/).waitFor();
    await page.getByText(/保护至 2026-11-16 收盘/).waitFor();
    await noOverflow(); await page.screenshot({ path: `${output}/${width}-plan.png`, fullPage: true });
    await page.getByRole('button', { name: /Orion/ }).click();
    await page.getByRole('tabpanel', { name: '历史决策', exact: true }).getByText(/自动卖出委托 0 张/).waitFor();
    await page.getByText(/32.50 时重新研究/).waitFor();
    await noOverflow(); await page.screenshot({ path: `${output}/${width}-research.png`, fullPage: true });
    await navigate('accounts');
    for (const tab of ['研究与预约', '持仓', '委托', '成交']) {
      await page.getByRole('tab', { name: tab, exact: true }).click(); await noOverflow();
    }
    await page.getByRole('tab', { name: '委托', exact: true }).click();
    await page.getByText(/等待父单成交/).waitFor();
    await page.screenshot({ path: `${output}/${width}-waiting.png`, fullPage: true });
    fixture.detail = protectionBrowserFixture('active').detail;
    await page.reload(); await page.getByRole('tab', { name: '委托', exact: true }).click();
    await page.getByText(/已保护 27 股/).waitFor(); await noOverflow();
    await page.screenshot({ path: `${output}/${width}-active.png`, fullPage: true });
    fixture.detail = protectionBrowserFixture('expired').detail;
    await page.reload(); await page.getByRole('tab', { name: '委托', exact: true }).click();
    await page.getByText(/27 股已失去该单保护/).waitFor(); await noOverflow();
    for (const [stage, expected] of [['partial', '已保护 6 股'], ['staged', '已保护 18 股'], ['trailing', '当前保护线 392'], ['sequential', '等待前批全成'], ['oco', '已保护 27 股'],
      ['staged_each', '已保护 7 股'], ['staged_each_growing', '已保护 17 股'], ['staged_each_zero', '已保护 2 股']]) {
      fixture.detail = protectionBrowserFixture(stage).detail;
      await page.reload(); await page.getByRole('tab', { name: '委托', exact: true }).click();
      await page.getByText(expected, { exact: false }).first().waitFor(); await noOverflow();
      if (stage === 'partial') await page.getByText(/共享 2 股/).waitFor();
      if (stage === 'staged_each' || stage === 'staged_each_zero') await page.getByText(/等待新增入场额度/).waitFor();
      if (stage === 'staged_each_growing') await page.getByText(/本档可退出 3 股/).waitFor();
      await page.screenshot({ path: `${output}/${width}-${stage}.png`, fullPage: true });
      if (stage === 'staged_each') {
        await navigate('decisions');
        await page.getByText(/扣除本档累计已退出量/).waitFor(); await page.getByText(/每次成交后按已买数量/).first().waitFor();
        await noOverflow(); await page.screenshot({ path: `${output}/${width}-staged-each-plan.png`, fullPage: true });
        await navigate('accounts');
      }
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, configurationReadback: true, researchOnly: true, waiting: true, protected: 27, expired: true, tabs: 4, errors: 0 }));
    await page.close();
  }
} finally { await browser.close(); }
