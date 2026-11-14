const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');

const baseUrl = process.env.MARKET_QUERY_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.MARKET_QUERY_QA_OUTPUT || '/tmp/market-query-entrypoints-qa';
mkdirSync(output, { recursive: true });

function unavailable(input) {
  const identity = input.instrument ? { instrument: input.instrument } : { market: input.market };
  return {
    ...identity,
    status: 'unavailable', items: [], source: null, fetchedAt: null,
    upstreamAttempts: null, nextCursor: null, cacheIdentity: null,
    coverage: {
      basis: input.instrument ? 'current-search' : 'current-feed',
      publishedStart: input.publishedStart, publishedEnd: input.publishedEnd,
      complete: false, truncated: false, unknownPublishedTimeCount: 0,
      examinedCount: null, returnedCount: 0, uniqueEvidenceCount: 0,
      missingReasons: ['service_unavailable'],
    },
    errors: [{ code: 'service_unavailable', message: '受控来源暂不可用', providerId: null, upstreamSource: null }],
  };
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.MARKET_QUERY_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.MARKET_QUERY_CHROMIUM_EXECUTABLE }
      : { channel: 'msedge' }),
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
      page.setDefaultTimeout(15000);
      const errors = [], writes = [], reads = [], requests = [];
      let failNews = true;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (request.method() === 'GET') {
          reads.push(path);
          return route.continue();
        }
        if (request.method() === 'POST' && ['/api/market-data/news', '/api/market-data/news-feed'].includes(path)) {
          const input = request.postDataJSON();
          requests.push({ path, input });
          if (failNews && path.endsWith('/news')) {
            failNews = false;
            return route.fulfill({ status: 503, json: { message: '受控新闻读取失败' } });
          }
          return route.fulfill({ json: unavailable(input) });
        }
        writes.push(`${request.method()} ${path}`);
        return route.abort();
      });
      await page.goto(`${baseUrl}/market-data`, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: '市场数据', exact: true }).waitFor();
      const actions = page.getByRole('group', { name: '市场查询', exact: true });
      assert.equal(await actions.getByRole('button').count(), 2);
      const tabs = page.getByRole('tablist', { name: '市场数据功能' });
      const tabBounds = await tabs.boundingBox(), actionBounds = await actions.boundingBox();
      assert(tabBounds && actionBounds);
      if (width >= 1024) assert(Math.abs(tabBounds.y - actionBounds.y) < 30, '桌面查询入口未与页签同行');
      await page.getByRole('tab', { name: '数据源', exact: true }).click();
      assert.equal(await page.getByRole('tab', { name: '数据源', exact: true }).getAttribute('aria-selected'), 'true');
      await page.screenshot({ path: `${output}/${width}-page.png`, fullPage: true });

      await actions.getByRole('button', { name: '查询资料', exact: true }).click();
      let dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: '市场资料查询' }).waitFor();
      const referenceBounds = await dialog.boundingBox();
      assert(referenceBounds && referenceBounds.x >= 0 && referenceBounds.x + referenceBounds.width <= width + 1);
      const code = dialog.getByRole('combobox', { name: '证券代码', exact: true });
      assert.equal(await code.inputValue(), '');
      assert.equal(await code.getAttribute('placeholder'), '');
      assert(!(await dialog.innerText()).includes('例如 600519.SH'));
      await code.fill('600519');
      await page.getByRole('option', { name: /贵州茅台/ }).click();
      assert.equal(await code.inputValue(), '贵州茅台 · 600519.SH');
      await code.click();
      await code.press('Escape');
      await dialog.getByRole('heading', { name: '市场资料查询' }).waitFor();
      assert.equal(await code.inputValue(), '贵州茅台 · 600519.SH');
      await page.screenshot({ path: `${output}/${width}-reference.png` });
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });

      await actions.getByRole('button', { name: '查看新闻', exact: true }).click();
      dialog = page.getByRole('dialog');
      await dialog.getByRole('heading', { name: '新闻与快讯' }).waitFor();
      const newsBounds = await dialog.boundingBox();
      assert(newsBounds && Math.abs(newsBounds.width - referenceBounds.width) <= 1, '抽屉宽度不一致');
      assert(Math.abs(newsBounds.width - Math.min(960, width - 16)) <= 1, '未使用标准详情宽度');
      const stock = dialog.getByRole('combobox', { name: '股票代码', exact: true });
      await stock.fill('600519');
      await page.getByRole('option', { name: /贵州茅台/ }).click();
      assert.equal(await stock.inputValue(), '贵州茅台 · 600519.SH');
      const chooseRange = async (label) => {
        await dialog.getByRole('combobox', { name: '时间范围', exact: true }).click();
        await page.getByRole('option', { name: label, exact: true }).click();
        assert((await dialog.getByRole('combobox', { name: '时间范围', exact: true }).innerText()).includes(label));
      };
      assert.equal(requests.length, 0);
      for (const label of ['最近 24 小时', '最近 30 天', '最近 7 天']) await chooseRange(label);
      assert.equal(requests.length, 0, '选择范围触发自动读取');
      await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
      await dialog.getByText('新闻未读取', { exact: true }).waitFor();
      assert.equal(requests[0].input.instrument.symbol, '600519.SH');
      assert.equal(Date.parse(requests[0].input.publishedEnd) - Date.parse(requests[0].input.publishedStart), 7 * 86400000);
      await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
      await dialog.getByRole('region', { name: '新闻检索结果' }).waitFor();
      assert((await dialog.innerText()).includes('发布时间范围：'));
      await chooseRange('自定义日期范围');
      assert.equal(await dialog.getByRole('region', { name: '新闻检索结果' }).count(), 0);
      await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
      await dialog.getByText('请选择起始日期和截止日期。', { exact: true }).waitFor();
      assert.equal(requests.length, 2);
      const start = dialog.getByRole('textbox', { name: '起始日期', exact: true });
      const end = dialog.getByRole('textbox', { name: '截止日期', exact: true });
      await start.fill('2026-11-09');
      await start.press('Tab');
      await end.fill('2026-11-08');
      await end.press('Tab');
      await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
      await dialog.getByText('截止日期不能早于起始日期。', { exact: true }).waitFor();
      assert.equal(requests.length, 2);
      await end.fill('2026-11-09');
      await end.press('Tab');
      await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
      await dialog.getByRole('region', { name: '新闻检索结果' }).waitFor();
      assert.equal(requests[2].input.publishedStart, '2026-11-08T16:00:00.000Z');
      assert.equal(requests[2].input.publishedEnd, '2026-11-09T15:59:59.999Z');
      await page.screenshot({ path: `${output}/${width}-news.png` });
      await dialog.getByRole('tab', { name: '市场快讯', exact: true }).click();
      await dialog.getByRole('combobox', { name: '股票代码', exact: true }).waitFor({ state: 'hidden' });
      await chooseRange('最近 24 小时');
      await dialog.getByRole('button', { name: '读取快讯', exact: true }).click();
      await dialog.getByRole('region', { name: '新闻检索结果' }).waitFor();
      const feed = requests.at(-1).input;
      assert.equal(feed.providerId, 'cls');
      assert.equal(Date.parse(feed.publishedEnd) - Date.parse(feed.publishedStart), 86400000);
      const overflow = await dialog.evaluate((element) => element.scrollWidth - element.clientWidth);
      assert(overflow <= 1, '抽屉横向溢出');
      await dialog.getByRole('button', { name: '关闭', exact: true }).click();
      await dialog.waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('tab', { name: '数据源', exact: true }).getAttribute('aria-selected'), 'true');
      const pageOverflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert(pageOverflow <= 1, '页面横向溢出');
      assert.equal(writes.length, 0);
      assert.deepEqual(errors, []);
      results.push({ width, drawerWidth: newsBounds.width, readCount: reads.length, controlledQueries: requests.length, writes: writes.length, passed: true });
      console.log(`通过：${width}px，抽屉 ${newsBounds.width}px，${requests.length} 次受控查询`);
      await page.close();
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
