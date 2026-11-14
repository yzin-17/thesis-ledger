const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const base = process.env.PRICE_RESEARCH_QA_URL || 'http://127.0.0.1:5187';
const output = process.env.PRICE_RESEARCH_QA_OUTPUT || '/tmp/price-research-qa';
const liveOnly = process.argv.includes('--live-readonly');
mkdirSync(output, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const results = [];
  try {
    for (const width of liveOnly ? [] : [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(10000);
      const errors = [],
        unexpected = [],
        bodies = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const request = route.request(),
          path = new URL(request.url()).pathname;
        if (!path.startsWith('/api/')) return route.continue();
        if (request.method() === 'GET') return route.fulfill({ json: [] });
        const body = request.postDataJSON();
        bodies.push({ path, body });
        if (path.endsWith('/versions')) {
          assert.equal(body.schema.schemaVersion, '3');
          const version = await page.evaluate(() => window.priceResearchQa.researchVersion);
          return route.fulfill({ json: { ...version, schema: body.schema } });
        }
        if (path.endsWith('/run-config/execution-model')) {
          assert.equal(body.adjustment, 'hfq');
          return route.fulfill({
            json: {
              status: 'available',
              policy: 'research-defaults',
              notes: ['受控研究模型'],
              model: await page.evaluate(() => window.priceResearchQa.model),
            },
          });
        }
        if (path.includes('submissions')) {
          assert.equal(body.input.preparation.priceResearch, 'price-research-v1');
          assert.equal(body.input.preparation.adjustment, 'hfq');
          return route.fulfill({ status: 503, json: { message: '受控提交失败，输入保留' } });
        }
        unexpected.push(`${request.method()} ${path}`);
        return route.abort();
      });
      for (const view of ['setup', 'result', 'editor', 'mobile']) {
        await page.goto(
          `${base}/test/browser-price-research${view === 'mobile' ? '-mobile' : ''}.html?view=${view}`,
        );
        await page
          .locator(`[data-price-research-qa="${view}"]`)
          .waitFor()
          .catch(async (error) => {
            throw new Error(
              `${error.message}; 页面异常: ${errors.join(';')}; ${(await page.locator('body').innerText()).slice(0, 1500)}`,
            );
          });
        if (view === 'setup') {
          const dialog = page.getByRole('dialog');
          await dialog.getByText('确认策略的研究口径').waitFor();
          assert(await dialog.getByRole('button', { name: '开始回测', exact: true }).isDisabled());
          await dialog.getByRole('button', { name: '采用研究口径并保存新版本' }).click();
          await dialog.getByText('受控研究模型').waitFor();
          const start = dialog.getByRole('button', { name: '开始回测', exact: true });
          await start.click();
          await dialog
            .getByText('服务暂时无法完成本次操作，请稍后重试。', { exact: false })
            .first()
            .waitFor();
          assert(await dialog.isVisible());
          assert((await dialog.locator('#backtest-cash').inputValue()) === '1000');
          const box = await dialog.boundingBox();
          assert(box.x >= 0 && box.x + box.width <= width + 1);
        } else if (view === 'result') {
          await page.getByText('模拟盈亏', { exact: true }).waitFor();
          await page.getByRole('tab', { name: '交易与订单' }).click();
          await page.getByRole('columnheader', { name: '投入参考份数' }).waitFor();
          await page.getByRole('tab', { name: '结果概览' }).click();
          const downloadPromise = page.waitForEvent('download');
          await page.getByRole('button', { name: '导出当前筛选区间' }).click();
          const download = await downloadPromise;
          await download.saveAs(`${output}/research-${width}.csv`);
        } else if (view === 'editor') {
          await page.getByText('保存口径预览', { exact: true }).waitFor();
          await page.getByRole('tab', { name: '高级 JSON' }).click();
          const json = page.locator('#strategy-json');
          await json.focus();
          await page.getByRole('button', { name: '应用 JSON' }).click();
          await page.getByText('保存口径预览', { exact: true }).waitFor();
        } else {
          await page.getByText('研究操作', { exact: true }).waitFor();
          assert((await page.locator('body').innerText()).includes('参考份数 100'));
        }
        await page.screenshot({ path: `${output}/${view}-${width}.png`, fullPage: true });
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${view}/${width} 横向溢出`,
        );
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(unexpected, []);
      results.push({ width, views: 4, apiRequests: bodies.length, actualBusinessWrites: 0 });
      await page.close();
    }
    if (liveOnly) {
      for (const width of [1440, 1024, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 1000 } });
        const blocked = [],
          errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/api/**', (route) => {
          if (route.request().method() === 'GET') return route.continue();
          blocked.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
          return route.abort();
        });
        await page.goto(
          `${process.env.PRICE_RESEARCH_QA_LIVE_URL || 'http://127.0.0.1:5173'}/strategy/library/new`,
        );
        await page.getByRole('tab', { name: '高级 JSON' }).click();
        const definition = JSON.parse(await page.locator('#strategy-json').inputValue());
        assert.equal(definition.schemaVersion, '3');
        assert.equal(definition.signalSources[0].priceCoordinate, 'research');
        assert.deepEqual(blocked, []);
        assert.deepEqual(errors, []);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: `${output}/live-editor-${width}.png`, fullPage: true });
        results.push({ width, liveReadonly: true, actualBusinessWrites: 0 });
        await page.close();
      }
    }
    writeFileSync(
      `${output}/${liveOnly ? 'live-' : ''}receipt.json`,
      JSON.stringify(results, null, 2),
    );
    console.log(JSON.stringify({ passed: true, results, output }));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
