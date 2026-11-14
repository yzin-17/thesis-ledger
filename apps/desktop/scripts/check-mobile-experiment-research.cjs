const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = process.env.PRICE_RESEARCH_QA_URL || 'http://127.0.0.1:5187';
const output = '/tmp/mobile-experiment-research-qa';
fs.mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const results = [];
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      const errors = [],
        bodies = [];
      let failAdoption = true,
        blockModel = true;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/api/**', async (route) => {
        const path = new URL(route.request().url()).pathname;
        const fixtures = await page.evaluate(() => window.optimizationResearchQa);
        if (path === '/api/qa/strategies')
          return route.fulfill({ json: [fixtures.sampleStrategy] });
        const body = route.request().postDataJSON();
        bodies.push({ path, body });
        if (path === '/api/qa/versions') {
          assert.equal(body.schema.schemaVersion, '3');
          if (failAdoption) {
            failAdoption = false;
            return route.fulfill({ status: 503, json: {} });
          }
          return route.fulfill({ json: { ...fixtures.researchVersion, schema: body.schema } });
        }
        assert.equal(path, '/api/qa/execution-model');
        assert.equal(body.adjustment, 'hfq');
        assert.equal(body.target.strategyVersionId, fixtures.researchVersion.id);
        if (blockModel) {
          blockModel = false;
          return route.fulfill({ json: { status: 'blocked', message: '受控设置不可用' } });
        }
        return route.fulfill({
          json: {
            status: 'available',
            notes: ['受控研究设置已自动准备'],
            model: fixtures.researchModel,
          },
        });
      });
      await page.goto(base + '/test/browser-price-research-mobile.html?optimization=1');
      const adopt = page.getByRole('button', { name: '采用研究口径并保存新版本', exact: true });
      await adopt.waitFor();
      await page.getByText('入场：', { exact: false }).waitFor();
      assert.equal(bodies.length, 0);
      await adopt.click();
      await page.getByText('受控版本保存失败', { exact: true }).waitFor();
      await adopt.click();
      await page.getByText('受控设置不可用', { exact: true }).waitFor();
      await page.getByRole('button', { name: '重新准备成交设置', exact: true }).click();
      await page.getByText('受控研究设置已自动准备', { exact: true }).waitFor();
      assert.equal(await adopt.count(), 0);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      assert.equal(bodies.length, 4);
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      await page.goto(base + '/test/browser-price-research-mobile.html');
      await page.getByText('后复权来源：futu / futu · 主源', { exact: true }).waitFor();
      await page.getByText('不复权来源：hithink / hithink-financial-api · 备用源', { exact: true }).waitFor();
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.deepEqual(errors, []);
      await page.screenshot({ path: `${output}/sources-${width}.png`, fullPage: true });
      results.push({
        width,
        previewConfirmed: true,
        failedAdoptionRetried: true,
        modelRetried: true,
        realWrites: 0,
      });
      await page.close();
    }
    fs.writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
