const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.MARKET_ROUTE_QA_OUTPUT || '/tmp/market-route-navigation-qa';
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
      page.setDefaultTimeout(5000);
      const errors = [],
        submissions = [];
      let fail = true;
      page.on('pageerror', (error) => errors.push(error.message));
      // 只允许受控策略请求；其余 API 均阻断，避免样本访问真实业务。
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request();
          const body = request.postDataJSON();
          if (request.method() === 'GET' || !body?.routes) return route.abort();
          submissions.push(body);
          if (fail) return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
          const { expectedRevision, ...desired } = body;
          return route.fulfill({
            json: {
              ...desired,
              syncState: 'applied',
              effectiveStale: false,
              dsaRevision: desired.revision,
              effectiveProjection: {
                ...desired,
                sourceDesiredRevision: desired.revision,
                appliedAt: new Date().toISOString(),
                routes: desired.routes.map((item) => ({
                  ...item,
                  reason: null,
                  targets: item.targets.map((target, routeIndex) => ({
                    ...target,
                    routeIndex,
                    eligible: true,
                    reason: null,
                  })),
                })),
              },
              lastError: null,
            },
          });
        },
      );
      await page.goto(
        `${process.env.MARKET_ROUTE_QA_BASE_URL || 'http://localhost:5188'}/test/browser-market-route-navigation.html`,
      );
      await page.getByRole('heading', { name: '行情与净值' }).waitFor();
      assert.equal(await page.getByRole('switch').count(), 0);
      async function category(name) {
        if (width >= 1024) await page.getByRole('tab', { name: new RegExp('^' + name) }).click();
        else {
          await page.getByRole('combobox', { name: '数据分类', exact: true }).click();
          await page.getByRole('option', { name: new RegExp('^' + name) }).click();
          await page.locator('[data-slot="select-content"]:visible').waitFor({ state: 'hidden' });
        }
      }
      async function choose(label, name) {
        await page.getByRole('combobox', { name: label, exact: true }).click();
        const popup = page.getByRole('listbox');
        const bounds = await popup.boundingBox();
        assert(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1, '选择器越界');
        const option = page.getByRole('option', { name, exact: true });
        try {
          await option.click();
          await page.locator('[data-slot="select-content"]:visible').waitFor({ state: 'hidden' });
        } catch (error) {
          console.log(
            await option
              .evaluate((element) => {
                const box = element.getBoundingClientRect();
                const over = document.elementFromPoint(
                  box.x + box.width / 2,
                  box.y + box.height / 2,
                );
                return {
                  label: element.textContent,
                  box: box.toJSON(),
                  over: over?.outerHTML.slice(0, 500),
                  popupZ: getComputedStyle(element.closest('[data-slot="select-content"]')).zIndex,
                };
              })
              .catch(() => '选项已卸载'),
          );
          await page.screenshot({ path: output + '/failure-' + width + '.png', fullPage: true });
          throw error;
        }
      }
      // 按精确键清空，展开与收起均不改写相邻复权口径。
      await page.getByRole('button', { name: '展开日线行情配置' }).click();
      await choose('中国内地股票 · 日线行情（日线／不复权） 主数据源', '未配置');
      await page.getByRole('button', { name: '收起日线行情配置' }).click();
      await category('交易规则');
      assert(
        (
          await page
            .getByRole('combobox', { name: '中国内地股票 · 风险警示 主数据源', exact: true })
            .textContent()
        ).includes('未配置'),
      );
      await choose('中国内地股票 · 风险警示 主数据源', '样本数据源 · sample-source');
      await page.getByText('其中 1 项不在当前视图', { exact: false }).waitFor();
      await page.getByRole('button', { name: '保存全部修改（2 项）' }).click();
      await page.getByRole('status').waitFor();
      assert.equal(submissions.length, 1, '保存必须经过受控 API');
      assert(!(await page.getByRole('status').textContent()).includes('已保存并应用'));
      assert(
        (
          await page
            .getByRole('combobox', { name: '中国内地股票 · 风险警示 主数据源', exact: true })
            .textContent()
        ).includes('样本数据源'),
      );
      fail = false;
      await page.getByRole('button', { name: '保存全部修改（2 项）' }).click();
      await page.getByRole('status').filter({ hasText: '已保存并应用' }).waitFor();
      const saved = submissions.at(-1);
      assert.equal(saved.enabled, true);
      assert(saved.routes.every((item) => item.enabled === true));
      assert(
        !saved.routes.some(
          (item) =>
            item.key.kind === 'bar' && item.key.market === 'CN' && item.key.adjustment === 'none',
        ),
      );
      assert(saved.routes.some((item) => item.key.capability === 'RISK_WARNING'));
      assert(saved.routes.some((item) => item.key.kind === 'bar' && item.key.adjustment === 'qfq'));
      await page.getByRole('button', { name: '刷新样本目录' }).click();
      await category('行情与净值');
      await page.getByRole('button', { name: '展开日线行情配置' }).click();
      assert(
        (
          await page
            .getByRole('combobox', {
              name: '中国内地股票 · 日线行情（日线／不复权） 主数据源',
              exact: true,
            })
            .textContent()
        ).includes('未配置'),
      );
      await page.getByRole('combobox', { name: '市场', exact: true }).click();
      await page.getByRole('option', { name: '香港', exact: true }).press('Escape');
      await page.waitForFunction(
        () =>
          document.querySelector('[aria-label="市场"]').getAttribute('aria-expanded') === 'false',
      );
      await page.locator('[data-slot="select-content"]:visible').waitFor({ state: 'hidden' });
      assert.equal(await page.getByRole('listbox').count(), 0);
      await choose('市场', '香港');
      await choose('标的类型', 'ETF');
      await page.getByText('当前范围没有此类路由', { exact: true }).waitFor();
      await page.getByRole('button', { name: '清除筛选' }).click();
      for (const name of ['财务与持仓', '资讯与资金', '宏观与市场', '证券资料与公司行动']) {
        await category(name);
        await page.getByRole('heading', { name, exact: true }).waitFor();
      }
      await category('行情与净值');
      await page.getByRole('button', { name: '展开日线行情配置' }).click();
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert(pageWidth <= width, `页面横向溢出 ${pageWidth} > ${width}`);
      const table = page.locator('[data-slot="table-container"]');
      const tableBox = await table.boundingBox();
      assert(tableBox && tableBox.x >= 0 && tableBox.x + tableBox.width <= width + 1);
      await page.screenshot({ path: `${output}/routes-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      results.push({
        width,
        crossCategorySave: true,
        exactKeys: true,
        failureRecovery: true,
        clearedAfterRefresh: true,
        scopeFilters: true,
        allCategories: true,
        popupWithinViewport: true,
        noPageOverflow: true,
      });
      console.log(JSON.stringify(results.at(-1)));
      await page.close();
    }
  } finally {
    writeFileSync(`${output}/results.json`, JSON.stringify(results, null, 2));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
