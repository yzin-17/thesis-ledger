const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.DECIMAL_RATIO_QA_OUTPUT || '/tmp/decimal-ratio-display-qa';
const baseUrl = process.env.DECIMAL_RATIO_QA_BASE_URL || 'http://127.0.0.1:5181';
const samples = [
  ['ordinary', '33.33%'],
  ['grouped', '1000.00%'],
  ['rounding', '1.01%'],
  ['tiny', '1E-398%'],
  ['negative', '-1E-398%'],
  ['huge', '1E402%'],
  ['empty', '1E-398%'],
  ['error', '1E-398%'],
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DECIMAL_RATIO_CHROMIUM_EXECUTABLE,
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
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== new URL(baseUrl).origin || url.pathname.startsWith('/api/')) {
            requests.push(url.origin + url.pathname);
            return route.abort();
          }
          return route.continue();
        });
        await page.goto(baseUrl + '/test/browser-decimal-ratio-display.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.decimalRatioReady === name,
          scenario,
        );
        const result = page.locator('[data-decimal-result]');
        for (const label of ['累计收益', '年化收益']) {
          const value = result.getByText(label, { exact: true }).locator('..').locator('dd');
          assert.equal(await value.innerText(), expected);
        }
        assert.equal(
          await result
            .getByText('夏普比率', { exact: true })
            .locator('..')
            .locator('dd')
            .innerText(),
          '1.234567890123456789',
        );
        assert.equal((await result.innerText()).includes('缺少有效估值'), true);
        assert.equal((await result.innerText()).includes('冻结说明：收益 0.00%'), true);
        const expectedFee = scenario === 'grouped' ? '1,000%' : '1E-398%';
        assert.equal((await result.innerText()).includes('申购费：' + expectedFee), true);
        assert.equal((await result.innerText()).includes('Infinity'), false);
        assert.equal(
          (await page.locator('[data-decimal-arena]').innerText()).includes(expected),
          true,
        );
        const model = page.locator('[data-decimal-model]');
        assert.equal((await model.innerText()).includes('费率 ' + expectedFee), true);
        const raw = await model
          .getByRole('textbox', { name: '基金净值执行模型配置', exact: true })
          .inputValue();
        await model.getByRole('button', { name: '确认费用与确认结算模型', exact: true }).click();
        assert.equal(
          await model
            .getByRole('button', { name: '已确认费用与确认结算模型', exact: true })
            .isDisabled(),
          true,
        );
        assert.equal(
          await model
            .getByRole('textbox', { name: '基金净值执行模型配置', exact: true })
            .inputValue(),
          raw,
        );
        const fund = page.locator('[data-decimal-fund]');
        if (scenario === 'empty') assert.equal((await fund.innerText()).trim(), '');
        else if (scenario === 'error') {
          assert.equal((await fund.innerText()).includes('收盘估算误差读取失败'), true);
          assert.equal(
            await fund.getByRole('button', { name: '重新读取', exact: true }).count(),
            1,
          );
        } else {
          assert.equal((await fund.innerText()).includes('相对绝对误差 ' + expected), true);
          assert.equal((await fund.innerText()).includes('定价覆盖 1E-7%'), true);
        }
        const desktopOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(desktopOverflow, false);
        const desktopScreenshot = join(output, scenario + '-desktop-' + width + '.png');
        await page.screenshot({ path: desktopScreenshot, fullPage: true });
        await page.goto(baseUrl + '/test/browser-mobile-decimal-ratio.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.decimalRatioReady === name,
          scenario,
        );
        const mobile = page.locator('[data-decimal-mobile]');
        const text = (await mobile.innerText()).replace(/\s+/g, ' ');
        if (scenario === 'empty') assert.equal(text.includes('尚无有效收盘估算'), true);
        else if (scenario === 'error') {
          assert.equal(text.includes('受控读取失败'), true);
          assert.equal(
            await mobile.getByRole('button', { name: '重新读取', exact: true }).count(),
            1,
          );
        } else {
          assert.equal(text.includes('相对绝对误差 ' + expected), true);
          assert.equal(text.includes('定价覆盖 1E-7%'), true);
        }
        assert.equal(text.includes('Infinity'), false);
        assert.equal(text.includes('NaN'), false);
        const mobileOverflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(mobileOverflow, false);
        const mobileScreenshot = join(output, scenario + '-mobile-' + width + '.png');
        await page.screenshot({ path: mobileScreenshot, fullPage: true });
        results.push({
          width,
          scenario,
          expected,
          passed: true,
          desktopOverflow,
          mobileOverflow,
          desktopScreenshot,
          mobileScreenshot,
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
