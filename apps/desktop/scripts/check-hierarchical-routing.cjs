const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const output = process.env.ROUTING_QA_OUTPUT || '/tmp/hierarchical-routing-qa';
const origin = process.env.ROUTING_QA_URL || 'http://localhost:5173';
mkdirSync(output, { recursive: true });

async function choose(page, name, option, within = page) {
  const trigger = within.getByRole('combobox', { name, exact: true });
  await trigger.click();
  const selectedOption = page.getByRole('option', { name: option, exact: true });
  await selectedOption.waitFor();
  const popupBounds = await page.locator('[data-slot="select-content"]').evaluateAll((nodes) =>
    nodes
      .filter((node) => node.getBoundingClientRect().width)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
      }),
  );
  const viewport = page.viewportSize();
  assert(
    popupBounds.every(
      (rect) =>
        rect.left >= -1 &&
        rect.right <= viewport.width + 1 &&
        rect.top >= -1 &&
        rect.bottom <= viewport.height + 1,
    ),
    JSON.stringify(popupBounds),
  );
  await selectedOption.click();
  await page.waitForFunction(
    (el) => el.getAttribute('aria-expanded') !== 'true',
    await trigger.elementHandle(),
  );
}
async function bounds(page, width) {
  const result = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    dialogs: [...document.querySelectorAll('[data-slot="sheet-content"]')]
      .filter((el) => el.getBoundingClientRect().width)
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      }),
  }));
  assert(result.page <= width, JSON.stringify(result));
  assert(
    result.dialogs.every((rect) => rect.left >= -1 && rect.right <= width + 1),
    JSON.stringify(result),
  );
  return result;
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.MARKET_ROUTE_CHROMIUM_EXECUTABLE,
  });
  const results = [];
  let activePage;
  try {
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({
        viewport: { width, height: 1000 },
        reducedMotion: 'reduce',
      });
      activePage = page;
      page.setDefaultTimeout(15000);
      const errors = [],
        forbidden = [],
        controlled = [];
      let view,
        preview,
        previewInput,
        savedView,
        attempts = 0,
        allowSuccess = false;
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const request = route.request(),
            path = new URL(request.url()).pathname;
          if (path === '/api/market-data/routing-config' && request.method() === 'GET') {
            if (savedView) return route.fulfill({ json: savedView });
            const response = await route.fetch();
            view = await response.json();
            if (width === 390) {
              view.pendingChanges = 1;
              view.config.rules = view.config.rules.filter(
                (rule) =>
                  !(
                    rule.scope.category === 'market' &&
                    rule.scope.market === 'CN' &&
                    rule.scope.assetType === 'STOCK' &&
                    rule.scope.capability === 'DAILY_BAR' &&
                    rule.scope.timeframe === '1d' &&
                    rule.scope.adjustment === 'qfq'
                  ),
              );
              view.config.rules.push({
                scope: {
                  category: 'market',
                  market: 'CN',
                  assetType: 'STOCK',
                  capability: 'DAILY_BAR',
                  timeframe: '1d',
                  adjustment: 'qfq',
                },
                providers: ['futu', 'tencent'],
              });
              return route.fulfill({ json: view });
            }
            return route.fulfill({ response });
          }
          if (path === '/api/market-data/routing-config/preview' && request.method() === 'POST') {
            previewInput = request.postDataJSON();
            const response = await route.fetch();
            preview = await response.json();
            return route.fulfill({ response });
          }
          if (path === '/api/market-data/routing-config' && request.method() === 'PUT') {
            controlled.push(request.postDataJSON());
            attempts++;
            if (!allowSuccess)
              return route.fulfill({ status: 503, json: { message: '受控保存失败' } });
            const input = request.postDataJSON();
            assert.equal(input.expectedRevision, view.revision);
            assert.equal(input.previewToken, preview.previewToken);
            savedView = {
              ...view,
              legacyRuleCount: 0,
              revision: view.revision + 1,
              config: input.config,
              diagnostics: preview.diagnostics,
              syncState: 'applied',
              newKeys: [],
            };
            const routes = preview.routes;
            const policy = {
              contractVersion: 3,
              consumer: 'thesis-ledger',
              requestId: 'browser-controlled',
              revision: savedView.revision,
              enabled: true,
              routes,
              syncState: 'applied',
              effectiveStale: false,
              effectiveProjection: {
                contractVersion: 3,
                consumer: 'thesis-ledger',
                requestId: 'browser-controlled',
                revision: savedView.revision,
                sourceDesiredRevision: savedView.revision,
                enabled: true,
                appliedAt: new Date().toISOString(),
                routes: routes.map((item) => ({
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
            };
            return route.fulfill({ json: policy });
          }
          if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
            forbidden.push(request.method() + ' ' + path);
            return route.abort();
          }
          return route.continue();
        },
      );
      await page.goto(origin + '/market-data');
      for (const name of [
        '行情与净值',
        '基本面数据',
        '新闻资讯',
        '宏观与市场',
        '交易规则',
        '证券资料与公司行动',
      ])
        await page.getByRole('heading', { name, exact: true }).waitFor();
      const initial = await bounds(page, width);
      console.log(JSON.stringify({ width, stage: 'main' }));
      const pending = Number(view.pendingChanges) > 0 || Number(view.legacyRuleCount) > 0;
      assert.equal(
        await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled(),
        pending,
      );
      assert.equal(await page.getByRole('switch', { name: /启用路由|启用功能/ }).count(), 0);
      const leafPath = '行情与净值 · 中国内地 · 股票 · 日线行情 · 日线 · 前复权';
      let capturedOverview = false;
      const openFine = async () => {
        await page
          .locator('section[aria-label="行情与净值"]')
          .getByRole('button', { name: /细分配置/ })
          .click();
        const fineSheet = page.getByRole('dialog');
        if (!capturedOverview) {
          await fineSheet.getByRole('combobox', { name: '市场', exact: true }).waitFor();
          assert.match(
            await fineSheet.getByRole('combobox', { name: '市场', exact: true }).textContent(),
            /全部市场/,
          );
          await page.screenshot({ path: `${output}/overview-${width}.png` });
          await fineSheet
            .getByRole('group', { name: leafPath + '数据源', exact: true })
            .getByRole('combobox', { name: '主数据源', exact: true })
            .click();
          await page.getByRole('option', { name: '未配置', exact: true }).waitFor();
          await page.keyboard.press('Escape');
          await page
            .getByRole('option', { name: '未配置', exact: true })
            .waitFor({ state: 'hidden' });
          assert(await fineSheet.getByRole('combobox', { name: '市场', exact: true }).isVisible());
          capturedOverview = true;
        }
        assert.equal(
          await fineSheet.getByRole('button', { name: /^(查看行情|展开行情|收起行情)/ }).count(),
          0,
        );
        assert.equal(await fineSheet.locator('[data-slot="collapsible"]').count(), 0);
        assert((await fineSheet.locator('[data-slot="routing-source-row"]').count()) > 20);
        const rowLabels = await fineSheet
          .locator('[data-slot="routing-source-row"] > div > span')
          .allTextContents();
        assert(!rowLabels.some((text) => text.endsWith(' · 默认')), '细分列表不展示聚合默认项');
        assert(
          !rowLabels.some((text) => / · (分钟行情|日线行情)$/.test(text)),
          '细分列表不展示行情汇总配置',
        );
        await choose(page, '标的类型', '股票', fineSheet);
        assert.match(
          await fineSheet.getByRole('combobox', { name: '市场', exact: true }).textContent(),
          /全部市场/,
        );
        await choose(page, '市场', '中国内地', fineSheet);
        await choose(page, '用途', '日线行情', fineSheet);
        await choose(page, '周期', '日线', fineSheet);
        await choose(page, '周期', '1 分钟', fineSheet);
        await fineSheet.getByRole('status').filter({ hasText: '没有符合筛选条件的配置' }).waitFor();
        await choose(page, '周期', '日线', fineSheet);
        const sources = fineSheet.getByRole('group', { name: leafPath + '数据源', exact: true });
        const before = await sources
          .getByRole('combobox', { name: '主数据源', exact: true })
          .boundingBox();
        await choose(page, '复权', '前复权', fineSheet);
        assert.equal(await fineSheet.locator('[data-slot="routing-source-row"]').count(), 1);
        if (width >= 640) {
          const after = await sources
            .getByRole('combobox', { name: '主数据源', exact: true })
            .boundingBox();
          assert(
            Math.abs(before.x - after.x) < 1 && Math.abs(before.width - after.width) < 1,
            '筛选前后列宽一致',
          );
        }
        await choose(page, '市场', '香港', fineSheet);
        assert.match(
          await fineSheet.getByRole('combobox', { name: '标的类型', exact: true }).textContent(),
          /股票/,
        );
        await choose(page, '市场', '中国内地', fineSheet);
        return fineSheet;
      };
      const scopeSources = (sheet) =>
        sheet.getByRole('group', { name: leafPath + '数据源', exact: true });
      const changePrimary = async (sheet) => {
        const fields = scopeSources(sheet);
        await choose(page, '主数据源', 'AKShare · 东方财富', fields);
      };
      let sheet = await openFine();
      const fine = await bounds(page, width);
      assert.equal(await sheet.getByRole('button', { name: /^(修改|正在修改)/ }).count(), 0);
      assert.equal(await sheet.getByRole('combobox', { name: /具体来源/ }).count(), 0);
      await scopeSources(sheet).getByRole('combobox', { name: '主数据源', exact: true }).waitFor();
      const primary = scopeSources(sheet).getByRole('combobox', { name: '主数据源', exact: true });
      await primary.focus();
      await primary.press('Enter');
      await page.getByRole('option', { name: '未配置', exact: true }).waitFor();
      assert.equal(
        await page.getByRole('option', { name: /^本地资料/ }).count(),
        0,
        '不支持行情的本地资料不能进入候选',
      );
      const unsupported = page.getByRole('option', { name: /^富途 OpenAPI/ });
      if (width === 390) {
        assert.match(await primary.textContent(), /不支持当前能力/);
        assert.equal(
          await unsupported.getAttribute('aria-disabled'),
          'true',
          '受控既有不适用来源只读回显',
        );
      } else {
        assert.equal(await unsupported.count(), 0, '不支持当前市场行情的提供方不能进入候选');
      }
      await page.keyboard.press('Escape');
      await page.getByRole('option', { name: '未配置', exact: true }).waitFor({ state: 'hidden' });
      assert(await sheet.isVisible());
      assert.equal(
        await sheet.getByRole('button', { name: '保存配置', exact: true }).isEnabled(),
        pending,
        '直接展示选择器不产生修改',
      );
      const hadOwn = view.config.rules.some(
        (rule) =>
          rule.scope.category === 'market' &&
          rule.scope.market === 'CN' &&
          rule.scope.assetType === 'STOCK' &&
          rule.scope.capability === 'DAILY_BAR' &&
          rule.scope.timeframe === '1d' &&
          rule.scope.adjustment === 'qfq',
      );
      if (!hadOwn) {
        await changePrimary(sheet);
        await sheet.getByRole('button', { name: '使用上级配置' + leafPath, exact: true }).click();
        assert.equal(
          await sheet.getByRole('button', { name: '保存配置', exact: true }).isEnabled(),
          pending,
          '恢复上级后不遗留当前范围修改',
        );
      }
      await page.screenshot({ path: `${output}/fine-${width}.png` });
      console.log(JSON.stringify({ width, stage: 'fine' }));
      await sheet.getByRole('button', { name: '返回主配置', exact: true }).click();
      assert.equal(
        await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled(),
        pending,
      );
      const news = view.config.rules.find(
        (rule) => rule.scope.category === 'research' && !rule.scope.market,
      );
      await choose(
        page,
        '新闻资讯主数据源',
        news?.providers.length ? '未配置' : 'AKShare · 按能力匹配',
      );
      sheet = await openFine();
      await changePrimary(sheet);
      await choose(page, '备用数据源', /^HiThink · (?!按能力匹配)/, scopeSources(sheet));
      assert.match(
        await scopeSources(sheet)
          .getByRole('combobox', { name: '主数据源', exact: true })
          .textContent(),
        /AKShare · 东方财富/,
      );
      assert.match(
        await scopeSources(sheet)
          .getByRole('combobox', { name: '备用数据源', exact: true })
          .textContent(),
        /^HiThink · /,
      );
      await page.screenshot({ path: `${output}/sources-${width}.png` });
      const editedValue = await scopeSources(sheet)
        .getByRole('combobox', { name: '主数据源', exact: true })
        .textContent();
      await sheet.getByRole('button', { name: '清空筛选', exact: true }).click();
      assert((await sheet.locator('[data-slot="routing-source-row"]').count()) > 20);
      await choose(page, '市场', '中国内地', sheet);
      await choose(page, '标的类型', '股票', sheet);
      await choose(page, '用途', '日线行情', sheet);
      await choose(page, '周期', '日线', sheet);
      await choose(page, '复权', '前复权', sheet);
      assert.equal(
        await scopeSources(sheet)
          .getByRole('combobox', { name: '主数据源', exact: true })
          .textContent(),
        editedValue,
        '清空和重新筛选保留草稿',
      );
      await sheet.getByRole('button', { name: '保存配置', exact: true }).click();
      await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
      console.log(JSON.stringify({ width, stage: 'preview' }));
      assert(preview.previewToken && preview.changes.length >= 0);
      const exact = previewInput.config.rules.find(
        (rule) =>
          rule.scope.category === 'market' &&
          rule.scope.market === 'CN' &&
          rule.scope.assetType === 'STOCK' &&
          rule.scope.capability === 'DAILY_BAR' &&
          rule.scope.timeframe === '1d' &&
          rule.scope.adjustment === 'qfq',
      );
      assert.deepEqual(exact.providers, ['akshare', 'hithink']);
      assert.deepEqual(exact.upstreamSources, {
        akshare: 'eastmoney',
        hithink: 'hithink-financial-api',
      });
      assert.equal(
        preview.exceptions,
        previewInput.config.rules.filter((rule) => rule.scope.market).length,
      );
      await page.getByRole('button', { name: '返回修改', exact: true }).click();
      assert(await page.getByRole('button', { name: '保存配置', exact: true }).isEnabled());
      await page.getByRole('button', { name: '保存配置', exact: true }).click();
      await page.getByRole('heading', { name: '确认保存配置', exact: true }).waitFor();
      await page.getByRole('button', { name: '确认保存', exact: true }).click();
      await page.getByRole('dialog').getByRole('alert').waitFor();
      const failedAttempts = attempts;
      assert(failedAttempts >= 1);
      allowSuccess = true;
      await page.getByRole('button', { name: '确认保存', exact: true }).click();
      await page.getByText('路由配置已保存并应用', { exact: true }).waitFor();
      console.log(JSON.stringify({ width, stage: 'controlled-save' }));
      assert.equal(attempts, failedAttempts + 1);
      assert.deepEqual(controlled[0], controlled[1], '失败后保留同一草稿');
      await page.getByRole('button', { name: '查看本地资料', exact: true }).click();
      await page.getByRole('heading', { name: '本地资料', exact: true }).waitFor();
      await bounds(page, width);
      await page.getByRole('dialog').getByRole('button', { name: '完成', exact: true }).click();
      await page.getByRole('tab', { name: '数据源', exact: true }).click();
      await page.getByRole('tab', { name: '路由策略', exact: true }).click();
      await page.getByRole('heading', { name: '行情与净值', exact: true }).scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${output}/main-${width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      assert.deepEqual(forbidden, []);
      results.push({
        width,
        initial,
        fine,
        controlledSaves: attempts,
        previewChanges: preview.changes.length,
        realWrites: 0,
        errors,
      });
      await page.unrouteAll({ behavior: 'ignoreErrors' });
      await page.close();
      activePage = undefined;
    }
    writeFileSync(output + '/results.json', JSON.stringify(results, null, 2));
    console.log(JSON.stringify(results));
  } catch (error) {
    if (activePage)
      await activePage.screenshot({ path: output + '/failure.png' }).catch(() => undefined);
    throw error;
  } finally {
    if (activePage) await activePage.unrouteAll({ behavior: 'ignoreErrors' });
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
