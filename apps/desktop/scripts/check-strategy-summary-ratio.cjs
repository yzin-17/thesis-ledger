const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const assert = require('node:assert/strict');
const baseUrl = process.env.SUMMARY_RATIO_QA_BASE_URL || 'http://127.0.0.1:5173';
const output = process.env.SUMMARY_RATIO_QA_OUTPUT || '/tmp/strategy-summary-ratio-qa';
const tiny = '0.' + '0'.repeat(399) + '1';
const samples = [
  ['ordinary', '25%', '0.03%', '0.0003'],
  ['rounding', '1%', '1%', '0.01000499999999999999999'],
  ['tiny', '1E-398%', '1E-398%', tiny],
  ['target', '12.346%', '12.346%', '0.123456'],
  ['grouped', '25%', '1,000%', '10'],
  ['huge', '25%', '1E402%', '1' + '0'.repeat(400)],
  ['zero', '25%', '0%', '0'],
  ['missing', null, null, '0.25'],
  ['invalid', null, null, '0'],
];
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.SUMMARY_RATIO_CHROMIUM_EXECUTABLE,
    headless: true,
  });
  const results = [],
    errors = [],
    requests = [];
  let activeCase, activePage;
  try {
    for (const width of [1440, 1024, 768, 390])
      for (const [scenario, expected, costExpected, rawCost] of samples) {
        activeCase = { width, scenario };
        const context = await browser.newContext({ viewport: { width, height: 1000 } }),
          page = await context.newPage();
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
        await page.goto(baseUrl + '/test/browser-strategy-summary-ratio.html?case=' + scenario);
        await page.waitForFunction(
          (name) => document.documentElement.dataset.summaryRatioReady === name,
          scenario,
        );
        const definition = page.getByRole('tabpanel');
        if (expected) {
          const field = (label) =>
            definition.getByText(label, { exact: true }).locator('..').locator('dd');
          assert.equal(
            await field('仓位管理').innerText(),
            (scenario === 'target' ? '目标仓位 ' : '每次使用权益的 ') + expected,
          );
          assert.equal(
            await field('风险约束').innerText(),
            '固定止损 ' + expected + '；固定止盈 ' + expected,
          );
          assert.equal(
            (await field('执行假设').innerText()).includes(
              '佣金率 ' + costExpected + '，滑点率 ' + costExpected,
            ),
            true,
          );
          assert.equal(
            await page.getByRole('button', { name: '生成风险规则', exact: true }).count(),
            1,
          );
        } else {
          assert.equal(
            (await page.getByRole('alert').innerText()).includes(
              scenario === 'missing' ? '策略定义缺少必需信息' : '策略摘要解析失败',
            ),
            true,
          );
          assert.equal(
            await page.getByRole('button', { name: '生成风险规则', exact: true }).count(),
            0,
          );
          assert.equal(
            await page.getByRole('tab', { name: 'AI 实验', exact: true }).isDisabled(),
            true,
          );
        }
        if (!expected) {
          assert.equal(
            await definition
              .getByText('主周期', { exact: true })
              .locator('..')
              .locator('dd')
              .innerText(),
            '日线',
          );
          if (scenario === 'invalid') {
            const message = await page.getByRole('alert').innerText();
            assert.equal(message.includes('比例必须大于 0 且小于或等于 1'), true);
            assert.equal(message.includes('ratio'), false);
          }
        }
        await page.getByText('诊断信息与完整定义', { exact: true }).click();
        const rawText = await definition.locator('pre').innerText(),
          raw = JSON.parse(rawText);
        assert.equal(raw.cost.commissionRate, rawCost);
        assert.equal(raw.cost.slippageRate, rawCost);
        assert.equal(raw.description, '冻结说明：仓位 0.00%');
        assert.equal(raw.primaryTimeframe, '1d');
        if (scenario === 'tiny') assert.equal(raw.sizing.percent, tiny);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        );
        assert.equal(overflow, false);
        const screenshot = join(output, scenario + '-' + width + '.png');
        await page.screenshot({ path: screenshot, fullPage: true });
        await page.getByText('诊断信息与完整定义', { exact: true }).click();
        for (const name of ['版本记录', '回测记录', '策略定义']) {
          const tab = page.getByRole('tab', { name, exact: true });
          await tab.click();
          assert.equal(await tab.getAttribute('aria-selected'), 'true');
        }
        await page.getByText('诊断信息与完整定义', { exact: true }).click();
        assert.equal(await page.getByRole('tabpanel').locator('pre').innerText(), rawText);
        const selector = page.getByRole('combobox', { name: '版本', exact: true });
        await selector.click();
        await page.getByRole('option', { name: 'v3', exact: true }).waitFor({ state: 'visible' });
        assert.equal(await page.getByRole('option', { name: 'v3', exact: true }).count(), 1);
        await page.keyboard.press('Escape');
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
