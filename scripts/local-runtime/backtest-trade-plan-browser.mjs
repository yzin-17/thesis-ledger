// 原样加载实际模型配置，受控 GET 返回独立策略，禁止真实业务提交。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { resolve } from 'node:path';
import { chromium } from 'playwright';
import {
  backtestTradePlanLines,
  backtestDailyOrderLines,
  backtestDailyOrderResultRows,
  backtestStrategyPlanReadback,
  formatDecimalRatioPercent,
} from '../../packages/domain/dist/index.js';
const capture = resolve(process.argv[2] ?? '');
const output = resolve(process.argv[3] ?? '/tmp/backtest-trade-plan-browser');
const origin = process.env.BACKTEST_PLAN_BROWSER_ORIGIN ?? 'http://127.0.0.1:5197';
const ruleReview = process.env.BACKTEST_PLAN_RULE_REVIEW === '1';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
try {
  const cases = process.env.BACKTEST_PLAN_CASES?.split(',') ?? [
    'initial-half',
    'remaining-half',
    'fixed-stop',
    'trailing-stop',
  ];
  for (const id of cases) {
    const sample = JSON.parse(await readFile(resolve(capture, id + '.json'), 'utf8'));
    if (!sample.configuration) continue;
    const currentReadback = backtestStrategyPlanReadback(sample.configuration);
    let targetLabel = ruleReview ? '入场规则' : '交易计划';
    if (sample.allowedPaths?.includes('execution')) targetLabel = '委托计划';
    if (sample.allowedPaths?.includes('execution.orders.0.validity')) targetLabel = '买单有效期';
    await writeFile(
      resolve(output, id + '-readback.json'),
      JSON.stringify(
        {
          capturedReadback: sample.readback,
          currentReadback,
          capturedReadbackEqual: isDeepStrictEqual(sample.readback, currentReadback),
        },
        null,
        2,
      ),
      { mode: 0o600, flag: 'wx' },
    );
    let views;
    if (process.env.BACKTEST_PLAN_ORDER_RESULTS === '1') views = ['orders', 'mobile-orders'];
    else if (process.env.BACKTEST_PLAN_PROPOSALS === '1') views = ['proposal', 'mobile-proposal'];
    else views = ['desktop', 'version', 'mobile'];
    for (const view of views)
      for (const width of [1440, 1024, 768, 390]) {
        const page = await browser.newPage({ viewport: { width, height: 960 } }),
          errors = [];
        page.setDefaultTimeout(10000);
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        await page.addInitScript(
          ({ configuration, beforeConfiguration, differences, allowedPaths, result }) => {
            window.tradePlanConfiguration = configuration;
            window.tradePlanBefore = beforeConfiguration;
            window.tradePlanDifferences = differences;
            window.tradePlanAllowedPaths = allowedPaths;
            window.tradePlanResult = result;
          },
          { ...sample, allowedPaths: sample.allowedPaths ?? (ruleReview ? ['entry'] : ['tradePlan']) },
        );
        await page.route('**/api/**', (route) => {
          assert.equal(route.request().method(), 'GET');
          const path = new URL(route.request().url()).pathname;
          if (!path.startsWith('/api/')) return route.continue();
          if (/groups|experiments/.test(path))
            return route.fulfill({
              json: {
                items: [],
                totalCount: 0,
                pageInfo: { nextCursor: null, hasNextPage: false },
              },
            });
          return route.fulfill({
            json: [
              {
                id: 'trade-plan-qa',
                name: '模拟交易计划',
                versions: [
                  {
                    id: 'trade-plan-version',
                    version: 1,
                    schemaVersion: Number(sample.configuration.schemaVersion),
                    schema: sample.configuration,
                  },
                ],
              },
            ],
          });
        });
        let query = '';
        if (view.includes('orders')) query = '?view=orders';
        else if (view.includes('proposal')) query = '?view=proposal';
        else if (view === 'version') query = '?view=version';
        await page.goto(
          origin +
            '/test/browser-backtest-trade-plan' +
            (view.startsWith('mobile') ? '-mobile' : '') +
            '.html' +
            query,
        );
        if (view.includes('orders')) {
          await page.getByText('日线委托与保护', { exact: true }).first().waitFor();
          const rows = backtestDailyOrderResultRows(sample.result.dailyOrders.orders);
          for (const row of rows) {
            for (const line of [row.quantity, row.terms, row.timing]) await page.getByText(line, { exact: true }).first().waitFor();
          }
          const search = view === 'orders' ? '搜索委托' : '搜索委托、父单或周期';
          await page.getByRole('textbox', { name: search, exact: true }).fill('不存在的委托-独立验收');
          if (view === 'orders') await page.getByRole('button', { name: '搜索', exact: true }).click();
          await page.getByText('没有匹配的委托', { exact: false }).first().waitFor();
          await page.getByRole('button', { name: view === 'orders' ? '清空' : '清空筛选', exact: true }).click();
          for (const row of rows) await page.getByText(row.timing, { exact: true }).first().waitFor();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${id}/${view}/${width} 溢出`);
          assert.deepEqual(errors, []);
          await page.screenshot({ path: resolve(output, `${id}-${view}-${width}.png`), fullPage: true });
          await page.close();
          continue;
        }
        if (view.includes('proposal')) {
          await page.getByText(ruleReview ? '原规则' : '原交易计划', { exact: true }).waitFor();
          await page.getByText(ruleReview ? '建议规则' : '建议交易计划', { exact: true }).waitFor();
          const expectedLines = [sample.beforeConfiguration, sample.configuration].flatMap(
            (configuration) =>
              ruleReview
                ? backtestStrategyPlanReadback(configuration)
                : backtestTradePlanLines(configuration.tradePlan, '研究单位'),
          );
          if (
            !ruleReview &&
            [sample.beforeConfiguration, sample.configuration].some(
              (configuration) => backtestTradePlanLines(configuration.tradePlan).length === 0,
            )
          )
            await page
              .getByText('未配置交易计划，按普通入场、退出、仓位与独立风险配置执行。', {
                exact: true,
              })
              .first()
              .waitFor();
          for (const line of new Set(expectedLines)) {
            await page.getByText(line, { exact: true }).first().waitFor();
            assert.equal(
              await page.getByText(line, { exact: true }).count(),
              expectedLines.filter((value) => value === line).length,
            );
          }
          if (view === 'proposal') {
            await page.getByRole('combobox', { name: '修改范围' }).focus();
            await page.keyboard.press('Enter');
            await page
              .getByRole('option', { name: targetLabel, exact: true })
              .click();
            await page
              .getByRole('combobox', { name: '修改范围' })
              .getByText(targetLabel, { exact: true })
              .waitFor();
          } else {
            await page
              .getByRole('radio', { name: targetLabel, exact: true })
              .click();
            assert.equal(
              await page
                .getByRole('radio', { name: targetLabel, exact: true })
                .getByText(targetLabel, { exact: true })
                .evaluate((element) => getComputedStyle(element).fontWeight),
              '600',
            );
          }
          await page
            .getByRole('button', {
              name: view === 'proposal' ? '确认应用修改' : '确认采用修改建议',
              exact: true,
            })
            .click();
          await page.getByText('已在独立样本采用', { exact: true }).waitFor();
          await page
            .getByRole('button', {
              name: view === 'proposal' ? '放弃修改建议' : '丢弃修改建议',
              exact: true,
            })
            .click();
          await page.getByText('已在独立样本放弃', { exact: true }).waitFor();
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
          assert.deepEqual(errors, []);
          await page.screenshot({
            path: resolve(output, `${id}-${view}-${width}.png`),
            fullPage: true,
          });
          await page.close();
          continue;
        }
        const readback =
          view === 'version'
            ? backtestTradePlanLines(
                sample.configuration.tradePlan,
                sample.configuration.schemaVersion === '3' ? '研究单位' : undefined,
                new Map(
                  sample.configuration.signalSources.map((source) => [
                    source.id,
                    `${source.asset.symbol}（${{ '1d': '日线', '60m': '60 分钟', '30m': '30 分钟', '15m': '15 分钟', '5m': '5 分钟', '1m': '1 分钟' }[source.timeframe]}${source.priceCoordinate ? ` · ${{ actual: '不复权', research: '后复权', run: '本次运行价格', 'native-nav': '发布单位净值' }[source.priceCoordinate]}` : ''}）`,
                  ]),
                ),
              )
            : currentReadback;
        const daily = sample.configuration.execution.timing === 'dailyBarOrders';
        if (view === 'version' && daily) {
          const labels = new Map(sample.configuration.signalSources.map(source => [source.id,
            `${source.asset.symbol}（${{ '1d': '日线', '60m': '60 分钟', '30m': '30 分钟', '15m': '15 分钟', '5m': '5 分钟', '1m': '1 分钟' }[source.timeframe]}${source.priceCoordinate ? ` · ${{ actual: '不复权', research: '后复权', run: '本次运行价格', 'native-nav': '发布单位净值' }[source.priceCoordinate]}` : ''}）` ]));
          readback.splice(0, readback.length, ...backtestTradePlanLines(sample.configuration.tradePlan, sample.configuration.schemaVersion === '3' ? '研究单位' : undefined, labels, true));
          await page.getByText(backtestDailyOrderLines(sample.configuration.execution, labels).join('\n\n'), { exact: true }).waitFor();
        }
        let lines = readback;
        if (view === 'version') lines = readback.length ? [readback.join('\n\n')] : [];
        if (view === 'version' && !readback.length) {
          assert.equal(await page.getByText('交易计划', { exact: true }).count(), 0);
          await page.getByText('仓位管理', { exact: true }).waitFor();
          const sizing = sample.configuration.sizing;
          if (sizing.type === 'percentOfEquity')
            await page
              .getByText('每次使用权益的 ' + formatDecimalRatioPercent(sizing.percent, 3), {
                exact: true,
              })
              .waitFor();
        }
        for (const line of lines)
          await page
            .getByText(line, { exact: true })
            .waitFor()
            .catch(async (error) => {
              const body = (await page.locator('body').innerText()).slice(-6000);
              throw new Error(
                `${id}/${view}/${width}: ${error}; ${JSON.stringify(errors)}; ${body}`,
              );
            });
        if (view === 'version') {
          if (currentReadback.some((line) => line.startsWith('会话统计'))) {
            await page
              .getByText(
                currentReadback.find((line) => line.startsWith('会话统计')),
                { exact: true },
              )
              .waitFor();
            const text = await page.locator('body').innerText();
            assert(!text.includes('无法识别的数值条件'));
            assert(text.includes(id === 'session-vwap' ? '当日累计均价' : '滚动成交量加权均价'));
          }
          for (const tab of ['版本记录', '回测记录', 'AI 实验', '策略定义'])
            await page.getByRole('tab', { name: tab, exact: true }).click();
          for (const line of lines) await page.getByText(line, { exact: true }).waitFor();
        }
        assert(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
          `${id}/${view}/${width} 溢出`,
        );
        assert.deepEqual(errors, []);
        await page.screenshot({
          path: resolve(output, `${id}-${view}-${width}.png`),
          fullPage: true,
        });
        await page.close();
      }
    console.log(JSON.stringify({ id, viewports: 4, views }));
  }
} finally {
  await browser.close();
}
