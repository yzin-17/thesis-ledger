const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.FINANCIAL_RATIO_QA_OUTPUT || '/tmp/financial-ratio-qa';
const baseUrl = process.env.FINANCIAL_RATIO_QA_BASE_URL || 'http://127.0.0.1:5173';
const samples = [
  ['ordinary', '33.33%'],
  ['rounding', '1.01%'],
  ['small', '1E-7%'],
  ['negative', '-1E-7%'],
  ['minimum', '5E-322%'],
  ['maximum', '1.797693E310%'],
  ['zero', '0.00%'],
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.FINANCIAL_RATIO_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390])
      for (const [scenario, expected] of samples) {
        activeCase = { width, scenario, expected };
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
        activePage = page;
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== new URL(baseUrl).origin || url.pathname.startsWith('/api/')) {
            requests.push(url.origin + url.pathname);
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(baseUrl + '/test/browser-financial-ratio.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.financialRatioReady === name,
          scenario,
        );
        for (const name of ['summary', 'portfolio'])
          assert.equal(
            (await page.locator('[data-ratio-' + name + ']').innerText()).includes(expected),
            true,
            name,
          );
        const allocation = page.locator('[data-ratio-allocation]');
        assert.equal(
          (await allocation.locator('tbody tr').first().locator('td').nth(4).innerText()).trim(),
          expected,
        );
        const risk = page.locator('[data-ratio-risk]');
        assert.equal(await risk.locator('strong').innerText(), '冻结消息：1.00% · 历史保留');
        assert.equal(
          await risk.locator('td').first().locator('span').first().innerText(),
          '权重 ' + expected,
        );
        const chart = page.locator('[data-ratio-trend]');
        const svg = chart.locator('svg[role=application]');
        await svg.focus();
        const status = chart.getByRole('status');
        await status.waitFor();
        assert.equal((await status.innerText()).includes('披露覆盖 ' + expected), true);
        assert.equal((await status.innerText()).includes('可定价覆盖 ' + expected), true);
        await svg.press('ArrowLeft');
        assert.equal(await status.count(), 1);
        await svg.press('Escape');
        await status.waitFor({ state: 'hidden' });
        await allocation.getByRole('button', { name: '调整目标', exact: true }).click();
        const dialog = page.getByRole('dialog');
        await dialog.waitFor();
        assert.equal((await dialog.innerText()).includes('当前 ' + expected), true);
        assert.equal((await dialog.innerText()).includes('Infinity'), false);
        assert.equal((await dialog.innerText()).includes('NaN'), false);
        if (scenario === 'maximum')
          assert.equal((await dialog.innerText()).includes('超出范围'), true);
        const bounds = await dialog.boundingBox();
        assert.equal(bounds.x >= -1 && bounds.x + bounds.width <= width + 1, true);
        const dialogScreenshot = join(output, scenario + '-dialog-' + width + '.png');
        await page.screenshot({ path: dialogScreenshot, fullPage: true });
        await dialog.getByRole('button', { name: '取消', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        await page
          .locator('[data-ratio-portfolio]')
          .getByTitle('按市值排序', { exact: true })
          .click();
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          containerOverflow: [
            ...document.querySelectorAll(
              '[data-ratio-summary],[data-ratio-allocation],[data-ratio-trend],[data-ratio-portfolio],[data-ratio-risk]',
            ),
          ].some((node) => node.scrollWidth > node.clientWidth + 1),
        }));
        assert.equal(metrics.overflow, false);
        assert.equal(metrics.containerOverflow, false);
        const screenshot = join(output, scenario + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({
          width,
          scenario,
          expected,
          passed: true,
          ...metrics,
          dialogScreenshot,
          screenshot,
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
