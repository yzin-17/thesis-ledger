const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const output = process.env.DECIMAL_RESET_QA_OUTPUT || '/tmp/decimal-reset-qa';
const baseUrl = process.env.DECIMAL_RESET_QA_BASE_URL || 'http://127.0.0.1:5173';
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.DECIMAL_RESET_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase;
  let activePage;
  try {
    for (const width of [1440, 1024, 768, 390]) {
      for (const scenario of [
        'ordinary',
        'external',
        'cancel',
        'controlled',
        'latest-default',
        'position',
      ]) {
        activeCase = { width, scenario };
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
        await page.goto(baseUrl + '/test/browser-decimal-form-reset.html?case=' + scenario);
        await page.waitForFunction(() => Boolean(window.decimalResetHarness));
        const original = await page.evaluate(() => window.decimalResetHarness.original);
        const fields = {};
        if (scenario === 'position') {
          fields.quantity = page.getByRole('spinbutton', { name: '当前数量', exact: true });
          fields.costPrice = page.getByRole('spinbutton', { name: '平均成本', exact: true });
        } else {
          fields.amount = page.getByRole('textbox', { name: '数值', exact: true });
        }
        for (const [key, field] of Object.entries(fields)) {
          await field.focus();
          assert.equal(await field.inputValue(), original[key]);
        }
        const read = () => page.evaluate(() => window.decimalResetHarness.read());
        const originalData = await read();
        for (const key of Object.keys(fields)) assert.equal(originalData[key], original[key]);
        const edits = {};
        for (const [key, field] of Object.entries(fields)) {
          const value = key === 'quantity' ? '3.3333333333333335' : '2.345678901234567890';
          edits[key] = value;
          await field.focus();
          await field.fill(value);
        }
        const beforeReset = await read();
        for (const key of Object.keys(fields)) assert.equal(beforeReset[key], edits[key]);
        const changes = await page.evaluate(() => window.decimalResetHarness.changes);
        assert.equal(changes, Object.keys(fields).length);
        const expected = { ...original };
        if (scenario === 'cancel' || scenario === 'controlled') Object.assign(expected, edits);
        if (scenario === 'latest-default') expected.amount = '3.456789012345678901';
        await page.getByRole('button', { name: '重置输入', exact: true }).click();
        await page.waitForFunction((values) => {
          const current = window.decimalResetHarness.read();
          return Object.entries(values).every(([key, value]) => current[key] === value);
        }, expected);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(await page.evaluate(() => window.decimalResetHarness.changes), changes);
        for (const [key, field] of Object.entries(fields)) {
          await field.focus();
          assert.equal(await field.inputValue(), expected[key]);
        }
        const focusField = Object.values(fields).at(-1);
        await focusField.focus();
        await focusField.fill('7.890123456789012345');
        const changedAgain = await page.evaluate(() => window.decimalResetHarness.changes);
        const focusedKey = Object.keys(fields).at(-1);
        if (scenario === 'cancel' || scenario === 'controlled')
          expected[focusedKey] = '7.890123456789012345';
        await page.evaluate(() => document.getElementById('decimal-reset-owner').reset());
        await page.waitForFunction((values) => {
          const current = window.decimalResetHarness.read();
          return Object.entries(values).every(([key, value]) => current[key] === value);
        }, expected);
        await page.evaluate(
          () =>
            new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
        );
        assert.equal(
          await focusField.evaluate((element) => document.activeElement === element),
          true,
        );
        assert.equal(await focusField.inputValue(), expected[focusedKey]);
        assert.equal(await page.evaluate(() => window.decimalResetHarness.changes), changedAgain);
        const metrics = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
          resets: window.decimalResetHarness.resets,
          values: window.decimalResetHarness.read(),
        }));
        assert.equal(metrics.overflow, false);
        assert.equal(metrics.resets, 2);
        const screenshot = join(output, scenario + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        results.push({ width, scenario, passed: true, ...metrics, screenshot });
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
      JSON.stringify(
        {
          activeCase,
          results,
          errors,
          requests,
          error: error.stack,
        },
        null,
        2,
      ),
    );
    if (activePage && !activePage.isClosed()) {
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
