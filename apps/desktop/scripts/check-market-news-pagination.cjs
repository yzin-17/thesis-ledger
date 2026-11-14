const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = process.env.MARKET_NEWS_PAGES_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.MARKET_NEWS_PAGES_OUTPUT || '/tmp/market-news-pagination';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  let debugPage, debugInputs;
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(20000);
    const errors = [], writes = [], inputs = [], pages = [];
    debugPage = page;
    debugInputs = inputs;
    let failNext = false;
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', async (route) => {
      const request = route.request(), path = new URL(request.url()).pathname;
      if (request.method() === 'GET') return route.continue();
      if (request.method() === 'POST' && path === '/api/market-data/news') {
        inputs.push(request.postDataJSON());
        if (failNext) {
          failNext = false;
          return route.fulfill({ status: 503, json: { message: '受控下一页读取失败' } });
        }
        return route.continue();
      }
      writes.push(`${request.method()} ${path}`);
      return route.abort();
    });
    await page.goto(`${base}/market-data`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '查看新闻', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('combobox', { name: '股票代码', exact: true }).fill('600036.SH');
    await page.getByRole('option').filter({ hasText: '600036.SH' }).click();
    const newsResponse = () => page.waitForResponse((response) => new URL(response.url()).pathname === '/api/market-data/news');
    let waiting = newsResponse();
    await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
    let data = await (await waiting).json();
    assert(data.items.length > 0 && data.nextCursor && !data.errors.length);
    pages.push(data);
    const result = dialog.getByRole('region', { name: '新闻检索结果' });
    await result.waitFor();
    const firstCount = await result.locator('ol > li').count();
    await dialog.getByRole('button', { name: '加载更多', exact: true }).waitFor();
    const initialText = await result.innerText();
    assert(initialText.includes(`已加载 ${firstCount} 条`));
    assert(!initialText.includes('部分覆盖') && !initialText.includes('覆盖范围有缺口'), '正常分页被标为覆盖缺口');
    assert(!['独立证据', '来源首次可用', '抓取时间', '抓取于'].some((text) => initialText.includes(text)), '新闻列表出现额外技术元数据');
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await page.screenshot({ path: `${output}/${width}-first-page.png` });
    }
    await page.setViewportSize({ width: 1440, height: 1100 });
    failNext = true;
    waiting = newsResponse();
    await dialog.getByRole('button', { name: '加载更多', exact: true }).click();
    assert.equal((await waiting).status(), 503);
    await dialog.getByRole('button', { name: '重试加载', exact: true }).waitFor();
    assert.equal(await result.locator('ol > li').count(), firstCount);
    const failedInput = inputs.at(-1);
    let pageCount = 1;
    while (data.nextCursor && pageCount < 150) {
      waiting = newsResponse();
      const more = dialog.getByRole('button', { name: pageCount === 1 ? '重试加载' : '加载更多', exact: true });
      await more.click();
      const response = await waiting;
      assert.equal(response.status(), 200);
      data = await response.json();
      assert.notEqual(data.status, 'unavailable', JSON.stringify(data.errors));
      assert.equal(data.errors.length, 0);
      pages.push(data);
      pageCount++;
      if (pageCount === 2) assert.deepEqual(inputs.at(-1), failedInput);
      await result.locator('[data-slot="list-refresh-region"][aria-busy="true"]').waitFor({ state: 'hidden' });
      if (pageCount % 10 === 0) console.log(`真实页 ${pageCount}，本页 ${data.items.length} 条，后续 ${Boolean(data.nextCursor)}`);
    }
    assert.equal(data.nextCursor, null, '超过验收页数预算，尚未确认来源耗尽');
    await dialog.getByText('所选时间范围内的来源新闻已加载完毕。', { exact: true }).waitFor();
    const ids = new Set(pages.flatMap((item) => item.items.map((row) => row.id)));
    assert(ids.size > 5);
    assert.equal(await result.locator('ol > li').count(), ids.size);
    assert.equal(await dialog.getByRole('button', { name: '加载更多', exact: true }).count(), 0);
    const original = inputs[0];
    for (const input of inputs) assert.deepEqual({ ...input, cursor: null }, { ...original, cursor: null });
    for (const item of pages.flatMap((item) => item.items)) {
      assert(item.publishedAt && Date.parse(item.publishedAt) >= Date.parse(original.publishedStart) && Date.parse(item.publishedAt) <= Date.parse(original.publishedEnd));
    }
    const dimensions = [];
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1100 });
      await result.scrollIntoViewIfNeeded();
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const bounds = await dialog.boundingBox();
      assert(bounds && Math.abs(bounds.width - Math.min(960, width - 16)) <= 1);
      assert((await dialog.evaluate((el) => el.scrollWidth - el.clientWidth)) <= 1);
      await page.screenshot({ path: `${output}/${width}.png` });
      dimensions.push({ width, drawerWidth: bounds.width });
    }
    await dialog.getByText('所选时间范围内的来源新闻已加载完毕。', { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/390-complete.png` });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual(errors, []);
    assert.deepEqual(writes, []);
    const receipt = { source: pages[0].source, query: original, pages: pages.length,
      uniqueItems: ids.size, rawReturned: pages.reduce((sum, item) => sum + item.items.length, 0),
      examined: pages.reduce((sum, item) => sum + (item.coverage.examinedCount || 0), 0),
      complete: data.coverage.complete, errors, writes, dimensions,
      summaries: pages.map((item) => ({ count: item.items.length, hasNext: !!item.nextCursor, complete: item.coverage.complete,
        reasons: item.coverage.missingReasons, fetchedAt: item.fetchedAt })) };
    writeFileSync(`${output}/results.json`, JSON.stringify(receipt, null, 2));
    console.log(JSON.stringify(receipt));
  } catch (error) {
    if (debugPage) {
      await debugPage.screenshot({ path: `${output}/failure.png` }).catch(() => {});
      writeFileSync(`${output}/failure.json`, JSON.stringify({ message: error.message, inputs: debugInputs,
        body: (await debugPage.locator('body').innerText()).slice(-6000) }, null, 2));
    }
    throw error;
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
