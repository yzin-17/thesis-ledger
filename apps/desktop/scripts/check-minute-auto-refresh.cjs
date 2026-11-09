const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.MINUTE_REFRESH_QA_OUTPUT || '/tmp/minute-auto-refresh-qa';
const origin = process.env.MINUTE_REFRESH_QA_URL || 'http://localhost:5186';
mkdirSync(output, { recursive: true });
const chartCount = (page) =>
  page.evaluate(
    () =>
      window.minuteFixture.requests.filter((input) => input.include?.join(',') !== 'quote').length,
  );

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MINUTE_REFRESH_CHROMIUM_EXECUTABLE || chromium.executablePath(),
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(10_000);
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => route.abort(),
      );
      await page.clock.install({ time: new Date('2026-11-09T02:30:00Z') });
      await page.clock.pauseAt(new Date('2026-11-09T02:30:01Z'));
      await page.goto(`${origin}/test/browser-minute-auto-refresh.html`);
      await page.clock.runFor(1000);
      const dialog = page.getByRole('dialog');
      await dialog.locator('[data-market-lightweight-chart] canvas').first().waitFor();
      const initial = await chartCount(page);
      const quoteMetrics = dialog.locator('[data-market-detail-section="quote"] strong');
      const initialQuote = await quoteMetrics.allTextContents();
      const automatic = dialog.getByRole('button', { name: '开启自动刷新', exact: true });
      assert.equal(await automatic.getAttribute('aria-pressed'), 'false');
      assert.equal(await dialog.getByRole('button', { name: '刷新行情', exact: true }).count(), 1);
      const initialRequests = await page.evaluate(() => window.minuteFixture.requests.length);
      await page.clock.runFor(121_000);
      assert.equal(await chartCount(page), initial);
      assert.equal(
        await page.evaluate(() => window.minuteFixture.requests.length),
        initialRequests,
      );
      await dialog.getByRole('button', { name: '刷新行情', exact: true }).click();
      await page.clock.runFor(1000);
      assert.equal(await chartCount(page), initial + 1);
      const manuallyRefreshed = await quoteMetrics.allTextContents();
      assert.notEqual(manuallyRefreshed[0], initialQuote[0]);
      assert.notEqual(manuallyRefreshed[1], initialQuote[1]);
      await automatic.focus();
      await page.keyboard.press('Space');
      await page.clock.runFor(1000);
      assert.equal(
        await dialog
          .getByRole('button', { name: '关闭自动刷新', exact: true })
          .getAttribute('aria-pressed'),
        'true',
      );
      const beforeAutomatic = await chartCount(page);
      const beforeQuote = await quoteMetrics.allTextContents();
      await page.evaluate(() => {
        window.minuteFixture.delay = 2000;
        window.minuteCanvas = document.querySelector('[data-market-lightweight-chart] canvas');
      });
      await page.clock.runFor(60_100);
      assert.equal(await chartCount(page), beforeAutomatic + 1);
      assert.deepEqual(await quoteMetrics.allTextContents(), beforeQuote);
      assert.equal(
        await dialog.getByRole('status', { name: '正在读取行情图数据', exact: true }).count(),
        1,
      );
      assert(await page.evaluate(() => window.minuteCanvas.isConnected));
      await page.screenshot({
        path: `${output}/refreshing-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await page.clock.runFor(2500);
      assert.equal(
        await dialog.getByRole('status', { name: '正在读取行情图数据', exact: true }).count(),
        0,
      );
      assert(await page.evaluate(() => window.minuteFixture.chartSequence >= 2));
      const afterQuote = await quoteMetrics.allTextContents();
      assert.notEqual(afterQuote[0], beforeQuote[0]);
      assert.notEqual(afterQuote[1], beforeQuote[1]);
      assert(
        await page.evaluate(() =>
          window.minuteFixture.requests
            .filter((input) => input.include?.join(',') !== 'quote')
            .at(-1)
            .include.includes('quote'),
        ),
      );
      const box = await dialog.boundingBox();
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      assert(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1));
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      await page.screenshot({
        path: `${output}/updated-${width}.png`,
        fullPage: true,
        animations: 'disabled',
      });
      await dialog.getByRole('button', { name: '关闭自动刷新', exact: true }).click();
      const disabledRequests = await page.evaluate(() => window.minuteFixture.requests.length);
      await page.clock.runFor(121_000);
      assert.equal(
        await page.evaluate(() => window.minuteFixture.requests.length),
        disabledRequests,
      );
      await dialog.getByRole('button', { name: '开启自动刷新', exact: true }).click();
      await page.clock.runFor(1000);
      await page.evaluate(() => {
        window.minuteFixture.state = 'closed';
        window.minuteFixture.delay = 0;
      });
      await page.clock.runFor(61_000);
      const closed = await chartCount(page);
      await page.clock.runFor(120_000);
      assert.equal(await chartCount(page), closed);
      await page.evaluate(() => {
        window.minuteFixture.state = 'unknown';
      });
      await page.clock.runFor(120_000);
      assert.equal(await chartCount(page), closed);
      await page.evaluate(() => {
        window.minuteFixture.state = 'open';
      });
      await page.clock.runFor(121_000);
      assert((await chartCount(page)) > closed);
      await page.evaluate(() => {
        window.minuteFixture.fail = true;
      });
      await page.clock.runFor(61_000);
      await dialog.locator('[data-market-latest-error]').waitFor();
      assert(await page.evaluate(() => window.minuteCanvas.isConnected));
      await page.evaluate(() => {
        window.minuteFixture.fail = false;
      });
      await page.clock.runFor(61_000);
      assert.equal(await dialog.locator('[data-market-latest-error]').count(), 0);
      await dialog.getByRole('button', { name: '日线', exact: true }).click();
      await page.clock.runFor(1000);
      const daily = await chartCount(page);
      const stopWhileDaily = dialog.getByRole('button', { name: '关闭自动刷新', exact: true });
      assert(await stopWhileDaily.isEnabled());
      await stopWhileDaily.click();
      const startWhileDaily = dialog.getByRole('button', { name: '开启自动刷新', exact: true });
      assert.equal(await startWhileDaily.getAttribute('aria-pressed'), 'false');
      assert(await startWhileDaily.isEnabled());
      assert((await startWhileDaily.getAttribute('title')).includes('切换分钟周期后'));
      await startWhileDaily.click();
      assert.equal(await dialog.getByRole('button', { name: '关闭自动刷新', exact: true }).getAttribute('aria-pressed'), 'true');
      await page.clock.runFor(120_000);
      assert.equal(await chartCount(page), daily);
      await dialog.getByRole('button', { name: '1 分钟', exact: true }).click();
      await page.clock.runFor(121_000);
      assert((await chartCount(page)) > daily);
      await page.keyboard.press('Escape');
      await page.clock.runFor(1000);
      assert.equal(await page.getByRole('dialog').count(), 0);
      const unmounted = await chartCount(page);
      await page.clock.runFor(120_000);
      assert.equal(await chartCount(page), unmounted);
      await page.getByRole('button', { name: '打开行情', exact: true }).click();
      await page.clock.runFor(1000);
      assert.equal(
        await page
          .getByRole('button', { name: '开启自动刷新', exact: true })
          .getAttribute('aria-pressed'),
        'false',
      );
      assert.deepEqual(errors, []);
      results.push({
        width,
        defaultOff: true,
        manualIcon: true,
        automaticToggle: true,
        dailyToggle: true,
        quoteAndPercentSynchronized: true,
        autoRefresh: true,
        oneSpinner: true,
        retainedCanvas: true,
        closedPaused: true,
        unknownPaused: true,
        resumed: true,
        failureRecovery: true,
        dailyPaused: true,
        closedCleanup: true,
        overflow: false,
      });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
