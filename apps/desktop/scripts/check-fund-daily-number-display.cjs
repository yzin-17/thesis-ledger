const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const samples = require('../test/fund-daily-number-samples.json');
const origin = process.env.FUND_DAILY_NUMBER_QA_BASE_URL || 'http://127.0.0.1:5181';
const output = process.env.FUND_DAILY_NUMBER_QA_OUTPUT || '/tmp/fund-daily-number-qa';
const cases = [
  ...samples.map((sample) => sample.name),
  'waiting',
  'empty',
  'error',
  'refresh',
  'loading',
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.FUND_DAILY_NUMBER_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    unexpectedRequests = [],
    controlledRequests = [];
  let activeCase, activePage;
  try {
    for (const platform of ['desktop', 'mobile'])
      for (const width of [1440, 1024, 768, 390])
        for (const name of cases) {
          activeCase = { platform, width, name };
          const context = await browser.newContext({
            viewport: { width, height: 900 },
            timezoneId: 'Asia/Shanghai',
          });
          const page = await context.newPage();
          activePage = page;
          page.setDefaultTimeout(10000);
          let responseRow;
          const beforeRequests = controlledRequests.length;
          page.on('pageerror', (e) => errors.push({ ...activeCase, message: e.message }));
          await page.route('**/*', (route) => {
            const req = route.request(),
              url = new URL(req.url());
            if (
              name === 'error' &&
              url.origin === new URL(origin).origin &&
              url.pathname === '/api/market/000001.OF/fund-valuation/daily-error' &&
              req.method() === 'GET' &&
              responseRow
            ) {
              controlledRequests.push({ ...activeCase, method: req.method(), path: url.pathname });
              return route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(responseRow),
              });
            }
            if (url.origin !== new URL(origin).origin || url.pathname.startsWith('/api/')) {
              unexpectedRequests.push({
                ...activeCase,
                method: req.method(),
                path: url.origin + url.pathname,
              });
              return route.abort();
            }
            return route.continue();
          });
          const entry =
            platform === 'mobile'
              ? 'browser-fund-daily-number-mobile.html'
              : 'browser-fund-daily-number.html';
          await page.goto(origin + '/test/' + entry + '?case=' + name);
          await page.waitForFunction(
            (name) => document.documentElement.dataset.fundDailyNumberReady === name,
            name,
          );
          await page.evaluate(() => document.fonts.ready);
          const initial = JSON.parse(await page.evaluate(() => window.__readFundDailyData()));
          responseRow = initial.source;
          const area = page.locator('[data-fund-daily-number]');
          if (name === 'error') {
            await area.getByRole('button', { name: '重新读取', exact: true }).click();
            await page.waitForFunction(
              () =>
                window.__readFundDailyQuery().status === 'success' &&
                window.__readFundDailyQuery().fetchStatus === 'idle',
            );
            assert.equal(
              await area.getByRole('button', { name: '重新读取', exact: true }).count(),
              0,
            );
            assert.equal(controlledRequests.length - beforeRequests, 1);
          } else if (['refresh', 'loading'].includes(name)) {
            assert.equal(
              (await page.evaluate(() => window.__readFundDailyQuery())).fetchStatus,
              'fetching',
            );
            if (name === 'refresh') assert.equal((await area.innerText()).includes('1.2346'), true);
            if (platform === 'mobile') {
              const label = name === 'refresh' ? '正在刷新，显示上次读取的数据' : '正在读取';
              assert.equal(await area.getByLabel(label, { exact: true }).count(), 1);
            }
            await page.getByRole('button', { name: '完成受控读取', exact: true }).click();
            await page.waitForFunction(() => window.__readFundDailyQuery().fetchStatus === 'idle');
            await page.waitForFunction(() =>
              document
                .querySelector('[data-fund-daily-number]')
                ?.textContent?.replace(/\s+/g, ' ')
                .includes('收盘估算 1.2346'),
            );
            if (platform === 'mobile')
              await area.getByRole('progressbar').waitFor({ state: 'hidden' });
          }
          const txt = (await area.innerText()).replace(/\s+/g, ' ');
          if (name === 'empty') {
            if (platform === 'desktop') assert.equal(txt.trim(), '');
            else assert.equal(txt.includes('尚无有效收盘估算'), true);
          } else {
            const expected = samples.find((sample) => sample.name === name) || samples[0];
            assert.equal(txt.includes('收盘估算 ' + expected.estimated), true);
            assert.equal(txt.includes('定价覆盖 1E-7%'), true);
            assert.equal(txt.includes('低覆盖'), true);
            assert.equal(txt.includes('2026-11-07'), true);
            if (name === 'waiting') {
              assert.equal(txt.includes('待同日正式净值'), true);
              assert.equal(txt.includes('估算差额'), false);
            } else {
              assert.equal(txt.includes('正式净值 ' + expected.official), true);
              assert.equal(txt.includes('估算差额 ' + expected.difference), true);
              assert.equal(txt.includes('相对绝对误差 1E-7%'), true);
            }
          }
          const after = JSON.parse(await page.evaluate(() => window.__readFundDailyData()));
          assert.deepEqual(after.source, initial.source);
          const expectedCache = ['error', 'loading'].includes(name)
            ? initial.source
            : initial.cache;
          assert.deepEqual(after.cache, expectedCache);
          if (name !== 'error') assert.equal(controlledRequests.length, beforeRequests);
          assert.equal(/NaN|Infinity/.test(txt), false);
          const overflow = await page.evaluate(
            () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          );
          assert.equal(overflow, false);
          const screenshot = join(output, platform + '-' + name + '-' + width + '.png');
          await page.screenshot({ path: screenshot, fullPage: true });
          results.push({
            ...activeCase,
            passed: true,
            overflow,
            screenshot,
            controlledReads: controlledRequests.length - beforeRequests,
          });
          await context.close();
        }
    assert.deepEqual(errors, []);
    assert.deepEqual(unexpectedRequests, []);
    assert.equal(controlledRequests.length, 8);
    writeFileSync(
      join(output, 'results.json'),
      JSON.stringify(
        {
          results,
          errors,
          unexpectedRequests,
          controlledRequests,
          realBusinessWrites: 0,
          realSourceReads: 0,
          nativeCompile: false,
        },
        null,
        2,
      ),
    );
    process.stdout.write(
      JSON.stringify({
        cases: results.length,
        controlledReads: controlledRequests.length,
        errors: errors.length,
        unexpectedRequests: unexpectedRequests.length,
      }) + '\n',
    );
  } catch (error) {
    if (activePage && !activePage.isClosed()) {
      await activePage
        .screenshot({ path: join(output, 'failure.png'), fullPage: true })
        .catch(() => {});
      writeFileSync(
        join(output, 'failure-text.txt'),
        await activePage
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
    }
    writeFileSync(
      join(output, 'failure.json'),
      JSON.stringify(
        {
          activeCase,
          results,
          errors,
          unexpectedRequests,
          controlledRequests,
          error: String(error.stack || error),
        },
        null,
        2,
      ),
    );
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(String(error.stack || error) + '\n');
  process.exitCode = 1;
});
