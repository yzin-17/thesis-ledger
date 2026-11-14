// 实际列表组件连接目标目录接口；只允许有界 GET，不打开比赛详情。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const origin = process.env.ARENA_QA_ORIGIN ?? 'http://127.0.0.1:5187';
const target = process.env.ARENA_CATALOG_API_ORIGIN ?? 'http://127.0.0.1:3000';
assert(['http://127.0.0.1:3000', 'http://localhost:3000'].includes(target), '只允许已确认的本地目标');
const output = process.env.ARENA_RUNTIME_QA_OUTPUT ?? '/tmp/arena-live-toolbar-runtime-qa';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 960 } }), errors = [], rejected = [];
    let requests = 0, firstTitle = '', total = 0;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() !== 'GET' || url.pathname !== '/api/v1/arena-matches/catalog' || ++requests > 6) {
        rejected.push(url.pathname); await route.abort(); return;
      }
      const response = await route.fetch({ url: target + url.pathname + url.search, maxRetries: 0, maxRedirects: 0 });
      assert.equal(response.status(), 200);
      const body = await response.json();
      if (!firstTitle) { firstTitle = body.items[0]?.title ?? ''; total = body.total; }
      await route.fulfill({ response });
    });
    const ready = () => page.locator('button[aria-label="刷新比赛"][aria-busy="false"]').waitFor();
    const act = async (action) => {
      const response = page.waitForResponse((item) => new URL(item.url()).pathname.endsWith('/arena-matches/catalog'));
      await action(); await response; await ready();
    };
    await act(() => page.goto(origin + '/test/browser-arena-live.html?path=/arena'));
    assert(firstTitle && total > 0);
    const search = page.getByRole('searchbox', { name: '搜索比赛' });
    await search.fill(firstTitle); await act(() => search.press('Enter'));
    await page.getByRole('link', { name: firstTitle, exact: true }).waitFor();
    await act(() => page.getByRole('button', { name: '清空筛选', exact: true }).click());
    await act(() => page.getByRole('button', { name: '刷新比赛', exact: true }).click());
    assert.equal(await page.getByRole('alert').count(), 0);
    assert.equal(await page.getByRole('combobox', { name: '排序', exact: true }).count(), 0);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []); assert.deepEqual(rejected, []);
    await page.screenshot({ path: output + '/' + width + '.png', fullPage: true });
    console.log(JSON.stringify({ width, total, catalogGets: requests, search: true, refresh: true,
      errors: 0, businessWrites: 0, sourceReads: 0, modelCalls: 0 }));
    await page.close();
  }
} finally { await browser.close(); }
