const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const baseUrl = process.env.BACKTEST_RATIO_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.BACKTEST_RATIO_QA_OUTPUT || '/tmp/backtest-ratio-qa';
const samples = [
  ['ordinary', '12.34%', '12.34%', '-12.34%'],
  ['rounding', '1.01%', '1.01%', '-1.01%'],
  ['tiny', '1E-398%', '1E-398%', '-1E-7%'],
  ['negative', '-1E-7%', '1E-7%', '-1E-7%'],
  ['maximum', '1.797693E310%', '1.797693E310%', '-1E-7%'],
  ['huge', '1E402%', '1E402%', '-1E-7%'],
  ['zero', '0.00%', '0.00%', '0.00%'],
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.BACKTEST_RATIO_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390])
      for (const [scenario, expected, magnitude, chartExpected] of samples) {
        activeCase = { width, scenario };
        const context = await browser.newContext({ viewport: { width, height: 1000 } }),
          page = await context.newPage();
        activePage = page;
        page.setDefaultTimeout(10000);
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== new URL(baseUrl).origin || url.pathname.startsWith('/api/')) {
            requests.push(url.origin + url.pathname);
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(baseUrl + '/test/browser-unified-backtest-ratio.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.backtestRatioReady === name,
          scenario,
        );
        assert.equal(
          await page.locator('[data-backtest-summary]').innerText(),
          '收益 ' + expected + ' · 回撤 ' + magnitude + ' · 夏普 1.23',
        );
        const detail = page.locator('[data-backtest-detail]');
        const overview = detail.getByRole('tabpanel');
        for (const [label, value] of [
          ['策略净收益', expected],
          ['最大回撤', magnitude],
        ]) {
          assert.equal(
            await overview
              .getByText(label, { exact: true })
              .locator('..')
              .locator('strong')
              .innerText(),
            value,
          );
        }
        const text = (await overview.innerText()).replace(/\s+/g, '');
        for (const value of [
          '夏普比率1.23',
          '不可用：缺少有效估值',
          '基准净收益' + expected,
          '净收益差' + expected,
        ])
          assert.equal(text.includes(value), true, value);
        assert.equal(text.includes('Infinity'), false);
        assert.equal(text.includes('NaN'), false);
        const chart = overview.getByRole('region', {
          name: '权益与回撤联动图表。上下键逐点查看，左右键平移，加减键缩放，Home 键重置。',
          exact: true,
        });
        await chart.waitFor({ state: 'visible' });
        await page.waitForFunction(() =>
          [...document.querySelectorAll('canvas')].some((c) => c.width > 0),
        );
        await chart.focus();
        await chart.press('ArrowDown');
        await page.waitForFunction(
          (expected) =>
            [...document.querySelectorAll('[role=status]')].some((e) =>
              e.textContent.replace(/\s+/g, '').includes('回撤：' + expected),
            ),
          chartExpected,
        );
        assert.equal((await overview.getByRole('status').innerText()).includes('已锁定'), true);
        await chart.press('ArrowDown');
        await chart.press('ArrowUp');
        const screenshot = join(output, scenario + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        await chart.press('Escape');
        assert.equal(await overview.getByRole('status').count(), 0);
        for (const name of ['放大图表', '缩小图表', '向前平移', '向后平移', '重置图表范围'])
          await overview.getByRole('button', { name, exact: true }).click();
        for (const name of ['交易与订单', '数据与假设', '结果概览']) {
          const tab = detail.getByRole('tab', { name, exact: true });
          await tab.click();
          assert.equal(await tab.getAttribute('aria-selected'), 'true');
        }
        await detail.getByRole('region').focus();
        await detail.getByRole('region').press('ArrowDown');
        assert.equal(
          (await detail.getByRole('status').innerText())
            .replace(/\s+/g, '')
            .includes('回撤：' + chartExpected),
          true,
        );
        await detail.getByRole('region').press('Escape');
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false);
        results.push({ width, scenario, passed: true, overflow, screenshot });
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
    if (activePage && !activePage.isClosed())
      await activePage
        .screenshot({ path: join(output, 'failure.png'), fullPage: true })
        .catch(() => {});
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  process.stderr.write(error.stack + '\n');
  process.exitCode = 1;
});
