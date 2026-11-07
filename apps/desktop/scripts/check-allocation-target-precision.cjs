const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const out = process.env.ALLOCATION_QA_OUTPUT || '/tmp/allocation-target-qa';
const baseUrl = process.env.ALLOCATION_QA_BASE_URL || 'http://127.0.0.1:5173';
mkdirSync(out, { recursive: true });
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.ALLOCATION_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const scenario of ['thirds', 'tiny', 'minimum', 'failure']) {
        const context = await browser.newContext({ viewport: { width, height: 900 } });
        const page = await context.newPage();
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
        await page.goto(
          baseUrl + '/test/browser-allocation-target-precision.html?case=' + scenario,
        );
        await page.waitForFunction(() => Boolean(window.allocationTargetHarness));
        const field = (category) =>
          page.getByRole('textbox', { name: category + '目标权重百分比', exact: true });
        const fill = async (category, value) => {
          await field(category).focus();
          await field(category).fill(value);
        };
        const save = page.getByRole('button', { name: '保存目标', exact: true });
        const open = async () => {
          await page.getByRole('button', { name: '编辑目标', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          await page.getByRole('dialog').evaluate(async (element) => {
            await Promise.all(
              element.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})),
            );
          });
          await page.getByRole('heading', { name: '设置配置目标', exact: true }).click();
        };
        const verifySubmit = async () => {
          if (await save.isDisabled()) {
            console.log(
              JSON.stringify({
                width,
                scenario,
                stage: 'disabled',
                fields: await page
                  .locator('input')
                  .evaluateAll((inputs) =>
                    inputs.map((i) => ({ label: i.getAttribute('aria-label'), value: i.value })),
                  ),
                body: await page.locator('body').innerText(),
              }),
            );
            await page.screenshot({ path: join(out, 'failure.png'), fullPage: true });
          }
          await save.click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          return page.evaluate(() => window.allocationTargetHarness.submissions);
        };
        await open();
        const dialog = await page.getByRole('dialog').boundingBox();
        assert(
          dialog &&
            dialog.x >= -1 &&
            dialog.x + dialog.width <= width + 1 &&
            dialog.y >= -1 &&
            dialog.y + dialog.height <= 901,
        );
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        await page.screenshot({ path: join(out, scenario + '-' + width + '.png'), fullPage: true });
        if (scenario === 'thirds') {
          assert.equal(await field('股票').inputValue(), '33.3333');
          await field('股票').focus();
          assert.equal(await field('股票').inputValue(), '33.33333333333333');
          await page.getByRole('heading', { name: '设置配置目标', exact: true }).click();
          assert.equal(await field('股票').inputValue(), '33.3333');
          await page.getByRole('button', { name: '取消', exact: true }).click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(await page.getByRole('alertdialog').count(), 0);
          await open();
          assert.deepEqual(await verifySubmit(), [{ stock: 1 / 3, etf: 1 / 3, cash: 1 / 3 }]);
          await open();
          await fill('ETF', '30');
          await fill('现金', '36.66666666666667');
          const submissions = await verifySubmit();
          assert.deepEqual(submissions[1], { stock: 1 / 3, etf: 0.3, cash: 0.3666666666666667 });
        } else if (scenario === 'failure') {
          const raw = '33.3333333333333333333333333';
          await fill('股票', raw);
          await page.evaluate(() => window.allocationTargetHarness.failNext());
          await save.click();
          await page.getByRole('alert').filter({ hasText: '受控保存失败' }).waitFor();
          await field('股票').focus();
          assert.equal(await field('股票').inputValue(), raw);
          await fill('股票', '');
          assert.equal(await save.isDisabled(), true);
          await fill('股票', '99.9995');
          await fill('ETF', '0');
          await fill('现金', '0');
          assert.equal(await save.isDisabled(), true);
          assert.equal(
            await page.getByRole('dialog').getByText('99.9995%', { exact: true }).count(),
            1,
          );
          await page.getByText('合计不足 100%，请增加目标权重。', { exact: true }).waitFor();
          assert.equal(
            await page.evaluate(() => window.allocationTargetHarness.submissions.length),
            1,
          );
        } else {
          assert(Number(await field('股票').inputValue()) > 0);
          const original = await page.evaluate(() => window.allocationTargetHarness.original);
          assert.deepEqual(await verifySubmit(), [original]);
          assert(original.stock > 0);
        }
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });
        if (scenario === 'failure')
          await page.screenshot({
            path: join(out, scenario + '-' + width + '.png'),
            fullPage: true,
          });
        results.push({ width, scenario, dialog, noOverflow: true, originalValuesPreserved: true });
        console.log(JSON.stringify({ width, scenario, passed: true }));
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    const result = { controlled: true, realBusinessWrites: 0, results, errors, requests };
    writeFileSync(join(out, 'results.json'), JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({ cases: results.length, errors: errors.length, requests: requests.length }),
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
