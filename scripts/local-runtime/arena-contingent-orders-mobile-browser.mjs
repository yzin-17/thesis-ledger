import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
import { protectionBrowserFixture } from '../fixtures/arena-contingent-orders.mjs';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.ARENA_MOBILE_QA_ORIGIN ?? 'http://127.0.0.1:5296';
const output = process.env.ARENA_QA_OUTPUT ?? '/tmp/arena-contingent-orders-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.ARENA_QA_CHANNEL ?? 'msedge' });
try {
  for (const width of [1440, 1024, 768, 390]) {
    const fixture = protectionBrowserFixture(), errors = [];
    const page = await browser.newPage({ viewport: { width, height: 960 }, hasTouch: true });
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      assert.equal(route.request().method(), 'GET');
      const path = new URL(route.request().url()).pathname;
      if (path.endsWith('/identity/context')) return route.fulfill({ json: { principal: { id: fixture.ids.a } } });
      if (path.endsWith('/arena-matches/' + fixture.ids.match)) return route.fulfill({ json: fixture.detail });
      if (path.includes('/watchlist')) return route.fulfill({ json: { revision: 1, items: [], groups: [], nextOffset: null } });
      return route.fulfill({ json: [] });
    });
    await page.goto(origin + '/test/browser-arena-live-mobile.html?match=' + fixture.ids.match);
    await page.getByText(/全部成交后，自动为本批/).waitFor();
    await page.getByRole('radio', { name: 'Orion', exact: true }).click();
    await page.getByText(/自动卖出委托 0 张/).waitFor();
    await page.getByText(/32.50 时重新研究/).waitFor();
    await page.getByRole('radio', { name: 'Atlas', exact: true }).click();
    for (const tab of ['持仓', '委托', '成交', '研究与预约']) await page.getByRole('radio', { name: tab, exact: true }).click();
    await page.getByRole('radio', { name: '委托', exact: true }).click();
    await page.getByText(/等待父单成交/).waitFor();
    await page.screenshot({ path: `${output}/${width}-mobile-waiting.png`, fullPage: true });
    fixture.detail = protectionBrowserFixture('active').detail;
    await page.reload(); await page.getByRole('radio', { name: '委托', exact: true }).click();
    await page.getByText(/已保护 27 股/).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.screenshot({ path: `${output}/${width}-mobile-active.png`, fullPage: true });
    for (const [stage, expected] of [['partial', '已保护 6 股'], ['staged', '已保护 18 股'], ['trailing', '当前保护线 392'], ['sequential', '等待前批全成'], ['oco', '已保护 27 股'],
      ['staged_each', '已保护 7 股'], ['staged_each_growing', '已保护 17 股'], ['staged_each_zero', '已保护 2 股']]) {
      fixture.detail = protectionBrowserFixture(stage).detail;
      await page.reload(); await page.getByRole('radio', { name: '委托', exact: true }).click();
      await page.getByText(expected, { exact: false }).first().waitFor();
      if (stage === 'staged_each' || stage === 'staged_each_zero') await page.getByText(/等待新增入场额度/).waitFor();
      if (stage === 'staged_each_growing') await page.getByText(/本档可退出 3 股/).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await page.screenshot({ path: `${output}/${width}-mobile-${stage}.png`, fullPage: true });
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, mobileWeb: true, protected: 27, researchOnly: true, errors: 0 }));
    await page.close();
  }
} finally { await browser.close(); }
