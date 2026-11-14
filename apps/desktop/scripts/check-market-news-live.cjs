const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');

const baseUrl = process.env.MARKET_NEWS_LIVE_BASE_URL || 'http://127.0.0.1:5173';
const symbol = process.env.MARKET_NEWS_LIVE_SYMBOL || '600036.SH';
const output = process.env.MARKET_NEWS_LIVE_OUTPUT || '/tmp/market-news-live-qa';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.MARKET_NEWS_LIVE_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.MARKET_NEWS_LIVE_CHROMIUM_EXECUTABLE }
      : { channel: 'msedge' }),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1200 }, reducedMotion: 'reduce', timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(20000);
    const errors = [], blockedWrites = [], queries = [];
    page.on('pageerror', (error) => errors.push(error.message));
    // 新闻 POST 是明确的只读查询；不拦截或替换来源响应，其余写请求全部拒绝。
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') return route.continue();
      const path = new URL(request.url()).pathname;
      if (request.method() === 'POST' && path === '/api/market-data/news') {
        const input = request.postDataJSON();
        assert.equal(input.instrument.symbol, symbol);
        assert.equal(input.limit, 5);
        assert.equal(Date.parse(input.publishedEnd) - Date.parse(input.publishedStart), 3 * 86400000);
        queries.push(input);
        return route.continue();
      }
      blockedWrites.push(`${request.method()} ${path}`);
      return route.abort();
    });
    await page.goto(`${baseUrl}/market-data`, { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: '查看新闻', exact: true }).click();
    const dialog = page.getByRole('dialog');
    const field = dialog.getByRole('combobox', { name: '股票代码', exact: true });
    await field.fill(symbol);
    const option = page.getByRole('option').filter({ hasText: symbol });
    await option.first().waitFor();
    assert.equal(await option.count(), 1);
    await option.click();
    const display = await field.inputValue();
    assert(display.includes(symbol) && display !== symbol, '未回显目录名称');
    assert((await dialog.getByRole('combobox', { name: '时间范围', exact: true }).innerText()).includes('最近 3 天'));
    assert.equal(queries.length, 0);
    const pending = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/market-data/news');
    await dialog.getByRole('button', { name: '读取新闻', exact: true }).click();
    const response = await pending;
    assert.equal(response.status(), 200);
    const data = await response.json();
    assert(['available', 'partial'].includes(data.status), JSON.stringify(data.errors));
    assert(data.items.length > 0, '真实来源未返回新闻');
    assert.equal(data.errors.length, 0);
    assert(data.upstreamAttempts >= 1 && data.source, '缺少真实来源执行事实');
    assert.equal(data.instrument.symbol, symbol);
    const result = dialog.getByRole('region', { name: '新闻检索结果' });
    await result.waitFor();
    const resultText = await result.innerText();
    assert(!['独立证据', '来源首次可用', '抓取时间', '抓取于'].some((text) => resultText.includes(text)), '新闻列表出现额外技术元数据');
    await dialog.getByRole('button', { name: '读取新闻', exact: true }).waitFor();
    for (const item of data.items) {
      const link = result.getByRole('link', { name: item.title, exact: true });
      assert.equal(await link.getAttribute('href'), item.originalUrl || item.url);
      assert.equal(await link.getAttribute('target'), '_blank');
    }
    const sizes = [];
    for (const width of [1440, 1024, 768, 390]) {
      await page.setViewportSize({ width, height: 1200 });
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const bounds = await dialog.boundingBox();
      assert(bounds && Math.abs(bounds.width - Math.min(960, width - 16)) <= 1);
      assert.equal(await result.locator('ol > li').count(), data.items.length);
      assert((await result.innerText()).includes('HiThink 同花顺'));
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        drawer: document.querySelector('[data-slot="sheet-content"]').scrollWidth - document.querySelector('[data-slot="sheet-content"]').clientWidth,
      }));
      assert(overflow.page <= 1 && overflow.drawer <= 1, '真实新闻内容横向溢出');
      await page.screenshot({ path: `${output}/${width}.png` });
      sizes.push({ width, drawerWidth: bounds.width, count: data.items.length, passed: true });
    }
    await result.locator('ol > li').last().scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${output}/390-news-bottom.png` });
    assert.equal(queries.length, 1, '调整视口重复调用来源');
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(blockedWrites.length, 0);
    assert.deepEqual(errors, []);
    const summary = {
      display, request: queries[0], status: data.status,
      source: { providerId: data.source.providerId, upstreamSource: data.source.upstreamSource, policyRevision: data.source.policyRevision },
      upstreamAttempts: data.upstreamAttempts, fetchedAt: data.fetchedAt, coverage: data.coverage,
      items: data.items.map((item) => ({ title: item.title, publishedAt: item.publishedAt, url: item.originalUrl || item.url })),
      sizes, blockedWrites, errors,
    };
    writeFileSync(`${output}/results.json`, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
