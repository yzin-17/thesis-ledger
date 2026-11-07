const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const samples = require('../test/market-number-samples.json');
const origin = process.env.MARKET_NUMBER_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.MARKET_NUMBER_QA_OUTPUT || '/tmp/market-number-readouts-qa';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
      executablePath: process.env.MARKET_NUMBER_CHROMIUM_EXECUTABLE,
      headless: true,
    }),
    results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390])
      for (const sample of samples) {
        const { name, value, compact, valuation, measurement, quote } = sample;
        activeCase = { width, name };
        const context = await browser.newContext({
            viewport: { width, height: 1000 },
            timezoneId: 'Asia/Shanghai',
          }),
          page = await context.newPage();
        activePage = page;
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push({ case: activeCase, message: e.message }));
        await page.route('**/*', (r) => {
          const url = new URL(r.request().url());
          if (url.origin !== new URL(origin).origin || url.pathname.startsWith('/api/')) {
            requests.push(url.origin + url.pathname);
            return r.abort();
          }
          return r.continue();
        });
        await page.goto(origin + '/test/browser-market-number-readouts.html?case=' + name);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.marketNumberReady === name,
          name,
        );
        await page.evaluate(() => document.fonts.ready);
        const raw = await page.evaluate(() => window.__readMarketNumberInput());
        const quoteArea = page.locator('[data-qa-quote]'),
          nav = page.locator('[data-qa-nav]'),
          fact = page.locator('[data-qa-chart-readout]'),
          stock = page.locator('[data-qa-stock]'),
          measure = page.locator('[data-qa-measure]'),
          intraday = page.locator('[data-qa-intraday]');
        if (value === null) {
          assert.equal((await quoteArea.innerText()).includes('当前没有可用实时行情'), true);
          assert.equal((await nav.innerText()).includes('当前没有可用基金净值'), true);
        } else {
          assert.equal((await quoteArea.innerText()).includes(quote), true);
          assert.equal((await nav.innerText()).includes(compact), true);
          assert.equal((await nav.innerText()).includes('净值日期'), true);
          if (value > 0)
            assert.equal(
              (await nav.locator('[data-fund-current-valuation]').innerText()).includes(valuation),
              true,
            );
          else
            assert.equal(
              (await nav.locator('[data-fund-current-valuation]').innerText()).includes('—'),
              true,
            );
        }
        assert.equal(
          (await page.locator('[data-qa-nav-readout]').innerText()).includes('单位净值 ' + compact),
          true,
        );
        const slots = fact.locator('[data-market-chart-readout-slot]');
        assert.equal((await slots.count()) > 4, true);
        const close = fact.locator('[data-market-chart-readout-slot="收"] dd');
        assert.equal(await close.innerText(), compact);
        const dif = fact.locator('[data-market-chart-readout-slot="DIF"] dd');
        assert.equal(await dif.innerText(), value !== null && value > 0 ? '-' + compact : compact);
        if (value !== null) {
          assert.equal(
            (await measure.getByLabel('价格区间测量结果').innerText()).includes(
              '价格区间：' + measurement,
            ),
            true,
          );
          if (value > 0)
            assert.equal(
              (await measure.getByLabel('价格区间测量结果').innerText()).includes(
                '-' + measurement,
              ),
              true,
            );
        } else assert.equal(await measure.getByLabel('价格区间测量结果').count(), 0);
        const plotExtreme = ['maximum', 'subnormal'].includes(name),
          plotValue = plotExtreme ? '1.2' : compact;
        assert.equal(
          (await stock.locator('figcaption').innerText()).includes('最新行情 ' + plotValue),
          true,
        );
        if (value === null)
          assert.equal(
            (await stock.locator('figcaption').innerText()).includes('最新行情 0'),
            false,
          );
        if (value !== null) {
          await stock.locator('canvas').first().waitFor({ state: 'visible' });
          await page.getByRole('button', { name: '受控选取区间', exact: true }).click();
          await stock.getByLabel('价格区间测量结果').waitFor({ state: 'visible' });
          const start = stock.getByRole('button', { name: '区间测量', exact: true });
          await start.click();
          assert.equal(await start.getAttribute('aria-pressed'), 'true');
          await page.keyboard.press('Escape');
          assert.equal(await start.getAttribute('aria-pressed'), 'false');
          await page.getByRole('button', { name: '受控选取区间', exact: true }).click();
          await stock.getByLabel('价格区间测量结果').waitFor({ state: 'visible' });
        }
        await intraday.locator('canvas').first().waitFor({ state: 'visible' });
        const footer = await intraday.locator('[data-market-nav-readout]').innerText();
        let expectedIntraday = '—';
        if (plotExtreme) expectedIntraday = '1.2000';
        else if (value !== null && value > 0) expectedIntraday = valuation;
        assert.equal(footer.includes('盘中估值 ' + expectedIntraday), true);
        await intraday.getByRole('button', { name: '历史净值', exact: true }).click();
        assert.equal(
          await page.evaluate(() => document.documentElement.dataset.marketNumberHistory),
          'requested',
        );
        const contained = await fact
          .locator('[data-market-chart-readout] > div')
          .evaluate((el) => ({
            scroll: el.scrollWidth,
            client: el.clientWidth,
            overflow: getComputedStyle(el).overflowX,
          }));
        if (width === 390) assert.equal(['auto', 'scroll'].includes(contained.overflow), true);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false);
        assert.equal(/NaN|Infinity/.test(await page.locator('body').innerText()), false);
        assert.equal(await page.evaluate(() => window.__readMarketNumberInput()), raw);
        const screenshot = join(output, name + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({
          ...activeCase,
          passed: true,
          overflow,
          screenshot,
          plotInput: plotExtreme ? 'integer' : name,
        });
        await context.close();
      }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    writeFileSync(
      join(output, 'results.json'),
      JSON.stringify({ results, errors, requests, realBusinessWrites: 0 }, null, 2),
    );
    process.stdout.write(
      JSON.stringify({ cases: results.length, errors: errors.length, requests: requests.length }) +
        '\n',
    );
  } catch (error) {
    writeFileSync(
      join(output, 'failure.json'),
      JSON.stringify({ activeCase, results, errors, requests, error: error.stack }, null, 2),
    );
    if (activePage && !activePage.isClosed()) {
      writeFileSync(
        join(output, 'failure-text.txt'),
        await activePage
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
      await activePage
        .screenshot({ path: join(output, 'failure.png'), fullPage: true })
        .catch(() => {});
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
