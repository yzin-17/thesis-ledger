const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/futu-cn-daily-ui';
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(15000);
      const writes = [],
        errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        (route) => {
          if (['GET', 'HEAD'].includes(route.request().method())) return route.continue();
          writes.push(route.request().method() + ' ' + new URL(route.request().url()).pathname);
          return route.abort();
        },
      );
      try {
        await page.goto(origin + '/market-data');
        await page
          .locator('section[aria-label="行情与净值"]')
          .getByRole('button', { name: /细分配置/ })
          .click();
        const sheet = page.getByRole('dialog');
        const checked = [];
        for (const adjustment of ['不复权', '前复权', '后复权']) {
          const row = sheet.locator('[data-slot="routing-source-row"]').filter({
            has: page.getByText('中国内地 · 股票 · 日线行情 · 日线 · ' + adjustment, {
              exact: true,
            }),
          });
          await row.waitFor();
          let found = false;
          for (const trigger of await row.getByRole('combobox').all()) {
            await trigger.click();
            await page.getByRole('option').first().waitFor();
            const option = page.getByRole('option', { name: '富途 OpenAPI', exact: true });
            if (await option.count()) {
              assert.notEqual(await option.getAttribute('aria-disabled'), 'true');
              const bounds = await page
                .locator('[data-slot="select-content"]')
                .evaluateAll((nodes) =>
                  nodes.map((node) => {
                    const r = node.getBoundingClientRect();
                    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
                  }),
                );
              assert(
                bounds.every(
                  (r) => r.left >= -1 && r.right <= width + 1 && r.top >= -1 && r.bottom <= 1001,
                ),
              );
              if (adjustment === '前复权')
                await page.screenshot({ path: `${output}/options-${width}.png` });
              found = true;
            }
            await page.keyboard.press('Escape');
            await page.getByRole('option').first().waitFor({ state: 'hidden' });
            if (found) break;
          }
          assert(found, adjustment + ' 应提供可选的富途具体来源');
          checked.push(adjustment);
        }
        assert.equal(await page.getByText('有未保存修改', { exact: true }).count(), 0);
        assert.deepEqual(writes, []);
        assert.deepEqual(errors, []);
        assert((await page.evaluate(() => document.documentElement.scrollWidth)) <= width);
        const result = { width, checked, realWrites: writes.length, errors };
        results.push(result);
        console.log(JSON.stringify(result));
      } finally {
        await page.unrouteAll({ behavior: 'ignoreErrors' });
        await page.close();
      }
    }
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
