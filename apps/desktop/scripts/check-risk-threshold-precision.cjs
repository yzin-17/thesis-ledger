const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const out = process.env.RISK_QA_OUTPUT || '/tmp/risk-threshold-qa';
const baseUrl = process.env.RISK_QA_BASE_URL || 'http://127.0.0.1:5173';
mkdirSync(out, { recursive: true });

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.RISK_CHROMIUM_EXECUTABLE,
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
        await page.goto(baseUrl + '/test/browser-risk-threshold-precision.html?case=' + scenario);
        await page.waitForFunction(() => Boolean(window.riskThresholdHarness));
        const field = page.locator('#risk-rule-threshold');
        const save = page.getByRole('button', { name: '保存修改', exact: true });
        const open = async () => {
          await page.getByRole('button', { name: '编辑规则', exact: true }).click();
          await page.getByRole('dialog').waitFor();
          await page.getByRole('dialog').evaluate(async (element) => {
            await Promise.all(
              element.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {})),
            );
          });
          await field.focus();
          await page.getByRole('heading', { name: '编辑风险规则', exact: true }).click();
        };
        const fill = async (value) => {
          await field.focus();
          await field.fill(value);
        };
        const submit = async (count) => {
          await save.click();
          await page.waitForFunction(
            (length) => window.riskThresholdHarness.submissions.length === length,
            count,
          );
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
        const original = await page.evaluate(() => window.riskThresholdHarness.original);
        if (scenario === 'thirds') {
          assert.equal(await field.inputValue(), '33.333333');
          await field.focus();
          assert.equal(await field.inputValue(), '33.33333333333333');
          await page.getByRole('heading', { name: '编辑风险规则', exact: true }).click();
          await page.getByRole('button', { name: '取消', exact: true }).click();
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(await page.getByRole('alertdialog').count(), 0);
          await open();
          await submit(1);
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(
            await page.evaluate(() => window.riskThresholdHarness.submissions[0].threshold),
            original,
          );
          await open();
          await page.getByRole('button', { name: '严重', exact: true }).click();
          await submit(2);
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          const latest = await page.evaluate(() => window.riskThresholdHarness.submissions[1]);
          assert.equal(latest.threshold, original);
          assert.equal(latest.severity, 'critical');
          await open();
        } else if (scenario === 'failure') {
          const raw = '26.645084677376735123456789';
          await fill(raw);
          await page.evaluate(() => window.riskThresholdHarness.failNext());
          await submit(1);
          assert.equal(await page.getByRole('dialog').count(), 1);
          await field.focus();
          assert.equal(await field.inputValue(), raw);
          await fill('1e-323');
          await save.click();
          await page.getByText('请输入有效阈值。', { exact: true }).waitFor();
          assert.equal(
            await page.evaluate(() => window.riskThresholdHarness.submissions.length),
            1,
          );
          await fill('0');
          await save.click();
          await page.getByText('百分比阈值需大于 0 且不超过 100%。', { exact: true }).waitFor();
          assert.equal(
            await page.evaluate(() => window.riskThresholdHarness.submissions.length),
            1,
          );
        } else {
          assert(Number(await field.inputValue()) > 0);
          const preview = await page
            .getByText('规则预览', { exact: true })
            .locator('..')
            .innerText();
          const match = /成本止损\s+(\S+)%/.exec(preview);
          assert(match && Number(match[1]) > 0);
          await page.getByText('规则预览', { exact: true }).locator('..').scrollIntoViewIfNeeded();
          await submit(1);
          await page.getByRole('dialog').waitFor({ state: 'hidden' });
          assert.equal(
            await page.evaluate(() => window.riskThresholdHarness.submissions[0].threshold),
            original,
          );
          await open();
          await page.getByText('规则预览', { exact: true }).locator('..').scrollIntoViewIfNeeded();
        }
        await page.evaluate(async () => {
          await Promise.all(
            document
              .getAnimations()
              .filter((a) => a.effect?.getComputedTiming().iterations !== Infinity)
              .map((a) => a.finished.catch(() => {})),
          );
        });
        await page.screenshot({ path: join(out, scenario + '-' + width + '.png'), fullPage: true });
        results.push({ width, scenario, dialog, originalPreserved: true, noOverflow: true });
        console.log(JSON.stringify({ width, scenario, passed: true }));
        await context.close();
      }
    }
    assert.deepEqual(errors, []);
    assert.deepEqual(requests, []);
    writeFileSync(
      join(out, 'results.json'),
      JSON.stringify({ results, errors, requests, realBusinessWrites: 0 }, null, 2),
    );
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
