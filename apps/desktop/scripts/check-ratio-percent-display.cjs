const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.RATIO_DISPLAY_QA_OUTPUT || '/tmp/ratio-display-qa';
const baseUrl = process.env.RATIO_DISPLAY_QA_BASE_URL || 'http://127.0.0.1:5181';
const samples = [
  ['ordinary', '33.33%', true],
  ['rounding', '1.01%', true],
  ['small', '1E-7%', true],
  ['negative', '-1E-7%', false],
  ['minimum', '5E-322%', true],
  ['maximum', '1.797693E310%', false],
  ['above', '225.00%', false],
  ['zero', '0.00%', true],
  ['unavailable', '—', false],
];
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.RATIO_DISPLAY_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const [scenario, expected, progress] of samples) {
        activeCase = { width, scenario, expected };
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
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
        await page.goto(baseUrl + '/test/browser-ratio-display.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.ratioReady === name,
          scenario,
        );
        const desktop = page.locator('[data-desktop-ratio]');
        if (scenario === 'unavailable')
          assert.equal((await desktop.locator('div').last().innerText()).trim(), expected);
        else assert.equal(await desktop.locator('span.tabular-nums').innerText(), expected);
        assert.equal(await desktop.getByRole('progressbar').count(), progress ? 1 : 0);
        if (progress)
          assert.equal(
            await desktop.getByRole('progressbar').getAttribute('aria-label'),
            '股票权重' + expected,
          );
        const desktopOverflow = await desktop.evaluate(
          (node) => node.scrollWidth > node.clientWidth + 1,
        );
        assert.equal(desktopOverflow, false);
        const desktopScreenshot = join(output, scenario + '-desktop-' + width + '.png');
        await page.screenshot({ path: desktopScreenshot, fullPage: true });
        await page.goto(baseUrl + '/test/browser-mobile-ratio-display.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.ratioReady === name,
          scenario,
        );
        const mobile = page.locator('[data-mobile-ratio]');
        const text = (await mobile.innerText()).replace(/\s+/g, ' ');
        for (const label of [
          '时间加权收益 ',
          '资金加权收益 ',
          '披露覆盖 ',
          '定价覆盖 ',
          '权重 ',
          '目标 ',
        ])
          assert.equal(text.includes(label + expected), true, label + expected);
        assert.equal(text.includes('Infinity'), false);
        assert.equal(text.includes('NaN'), false);
        await mobile.getByRole('button', { name: '显示更多收益明细', exact: true }).click();
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          componentOverflow: [
            ...document.querySelectorAll('[data-desktop-ratio], [data-mobile-ratio]'),
          ].some((node) => node.scrollWidth > node.clientWidth + 1),
        }));
        assert.equal(metrics.overflow, false);
        assert.equal(metrics.componentOverflow, false);
        const screenshot = join(output, scenario + '-mobile-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({ width, scenario, expected, progress, passed: true, ...metrics, screenshot });
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    writeFileSync(
      join(output, 'results.json'),
      JSON.stringify(
        {
          results,
          errors,
          requests,
          realBusinessWrites: 0,
          nativeBoundary: '仅隔离运行环境与原生图表容器；两端比例与 Mobile 收益明细使用实际源码',
        },
        null,
        2,
      ),
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
