const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const origin = process.env.MARKET_PERCENT_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.MARKET_PERCENT_QA_OUTPUT || '/tmp/market-percent-units-qa';
const scenarios = [
  ['ordinary', '+12.35%', '+12.35%', '+12.35%', '12.35%'],
  ['tiny-positive', '+1E-7%', '+1E-7%', '+1E-7%', '1E-7%'],
  ['tiny-negative', '-1E-7%', '-1E-7%', '-1E-7%', '1E-7%'],
  ['zero', '+0.00%', '+0.00%', '0.00%', '0.00%'],
  ['maximum-percent', '+25.00%', '+1.797693E308%', '+25.00%', '25.00%'],
  ['missing', '—', null, '--', null],
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.MARKET_PERCENT_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390])
      for (const [name, ratioLabel, percentLabel, quoteLabel, chipLabel] of scenarios) {
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
        await page.goto(origin + '/test/browser-market-percent-units.html?case=' + name);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.marketPercentReady === name,
          name,
        );
        await page.evaluate(() => document.fonts.ready);
        const raw = await page.evaluate(() => window.__readMarketPercentInput());
        const quote = page.locator('[data-qa-quote]'),
          chip = page.locator('[data-qa-chip]'),
          current = page.locator('[data-fund-current-valuation]'),
          stock = page.locator('[data-market-price-chart]'),
          history = page.locator('[data-qa-history]');
        assert.equal((await quote.innerText()).includes(quoteLabel), true);
        if (chipLabel) assert.equal(await chip.getByText(chipLabel, { exact: true }).count(), 2);
        else assert.equal((await chip.innerText()).includes('当前没有可用筹码摘要'), true);
        const currentText = await current.innerText();
        assert.equal(currentText.includes('已休市'), true);
        if (percentLabel) assert.equal(currentText.includes(percentLabel), true);
        else assert.equal(currentText.includes('%'), false);
        await stock.locator('canvas').first().waitFor({ state: 'visible' });
        if (name === 'missing')
          assert.equal((await stock.locator('figcaption').innerText()).includes('可视区间'), false);
        else
          await page.waitForFunction(
            (expected) =>
              document
                .querySelector('[data-market-price-chart] figcaption')
                .textContent.includes('可视区间 ' + expected),
            ratioLabel,
          );
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-qa-history] [data-market-nav-readout]')
              .textContent.includes('可视区间涨跌幅 ' + expected),
          ratioLabel,
        );
        const direct = page.locator('[data-qa-direct-readout]');
        assert.equal(
          (await direct.innerText()).includes(
            '可视区间涨跌幅 ' + (name === 'maximum-percent' ? '+1.797693E310%' : ratioLabel),
          ),
          true,
        );
        const fullscreen = page.getByRole('button', { name: '全屏', exact: true });
        await fullscreen.click();
        await page.getByRole('dialog').waitFor({ state: 'visible' });
        assert.equal((await page.getByRole('dialog').locator('canvas').count()) > 0, true);
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
        await page.waitForFunction(() => document.activeElement?.textContent === '全屏');
        await history.getByRole('button', { name: '今日', exact: true }).click();
        const intraday = history.locator('[data-fund-intraday-chart]'),
          readout = intraday.locator('[data-market-nav-readout]');
        await intraday.locator('canvas').first().waitFor({ state: 'visible' });
        if (percentLabel) {
          assert.equal((await readout.innerText()).includes(percentLabel), true);
          assert.equal((await readout.innerText()).includes('部分覆盖'), true);
          const canvas = intraday.locator('canvas').first();
          await canvas.scrollIntoViewIfNeeded();
          const box = await canvas.boundingBox();
          let locked = false;
          for (const fraction of [0.25, 0.5, 0.75, 0.9]) {
            await page.mouse.click(box.x + box.width * fraction, box.y + box.height * 0.4);
            if ((await readout.innerText()).includes('已锁定')) {
              locked = true;
              break;
            }
          }
          assert.equal(locked, true);
          await page.keyboard.press('Escape');
          assert.equal((await readout.innerText()).includes('已锁定'), false);
        } else {
          assert.equal((await readout.innerText()).includes('盘中估值 —'), true);
          assert.equal((await readout.innerText()).includes('估值不可用'), true);
        }
        const intradayScreenshot = join(output, name + '-intraday-' + width + '.png');
        await page.screenshot({ path: intradayScreenshot, fullPage: true });
        await intraday.getByRole('button', { name: '历史净值', exact: true }).click();
        await history
          .getByRole('button', { name: '今日', exact: true })
          .waitFor({ state: 'visible' });
        await page.waitForFunction(
          (expected) =>
            document
              .querySelector('[data-qa-history] [data-market-nav-readout]')
              .textContent.includes('可视区间涨跌幅 ' + expected),
          ratioLabel,
        );
        const body = await page.locator('body').innerText();
        assert.equal(/NaN|Infinity/.test(body), false);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false);
        assert.equal(await page.evaluate(() => window.__readMarketPercentInput()), raw);
        const screenshot = join(output, name + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({ ...activeCase, passed: true, overflow, screenshot, intradayScreenshot });
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
