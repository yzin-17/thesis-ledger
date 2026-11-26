import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createRiskMobileHost, launchRegressionBrowser } from '../runtime.mjs';
const output = process.env.STRATEGY_MONITORING_QA_OUTPUT;
assert(output, '请通过统一界面回归入口执行');
await mkdir(output, { recursive: true });
const { server, mobileOrigin } = await createRiskMobileHost(output);
const appId = '11111111-1111-4111-8111-111111111111';
const ruleIds = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const rules = ruleIds.map((id, index) => ({
  id,
  version: 1,
  kind: index ? 'max-holding-period' : 'cost-stop',
  scope: 'security',
  severity: 'warning',
  threshold: index ? 10 : -0.03,
  enabled: true,
  needsRepair: false,
  repairReason: null,
  archivedAt: null,
  symbol: '00700.HK',
  accountId: appId,
  sourcePlanId: appId,
  effectiveAt: '2026-01-01T00:00:00Z',
}));
const reasons = {
  missing: [
    ['position_missing', '缺少实际持仓数量'],
    ['position_missing', '缺少实际持仓数量'],
  ],
  calendar: [
    ['calendar_unavailable', '交易日历未覆盖评价时点，无法确认已完成日线'],
    ['daily_bars_route_not_configured', '尚未选择日线数据来源'],
  ],
  holding: [
    ['average_cost_missing', '缺少账户投影平均成本'],
    ['holding_start_missing', '缺少可验证的持仓开仓时间'],
  ],
  pending: [
    ['evaluation_pending', '等待后台完成首次评估'],
    ['evaluation_pending', '等待后台完成首次评估'],
  ],
  healthy: [],
};
const status = (scenario) => ({
  mode: 'observed-data',
  continuousSource: false,
  eligibleRules: 2,
  futureRules: 0,
  unsupportedRules: 0,
  checkedAt: new Date().toISOString(),
  evaluatedAt: null,
  gapAt: null,
  missingPrices: 0,
  inputUnavailable: 0,
  inputReason: null,
  delayedPrices: 0,
  processorAvailable: true,
  error: null,
  acquisitionAvailable: true,
  sources: [],
  limitation: '按已完成日线及实际持仓自动评估。',
  ruleIssues: reasons[scenario].map(([reasonCode, reason], index) => ({
    ruleId: ruleIds[index],
    ruleVersion: 1,
    applicationId: appId,
    symbol: '00700.HK',
    assetName: '腾讯控股',
    ruleLabel: index ? '最大持有周期' : '成本止损',
    state: scenario === 'pending' ? 'pending' : 'unavailable',
    reasonCode,
    reason,
    checkedAt: scenario === 'pending' ? null : new Date().toISOString(),
  })),
});
let browser;
let activePage;
try {
  browser = await launchRegressionBrowser();
  for (const surface of ['desktop', 'mobile'])
    for (const width of [1440, 1024, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 1000 } });
      activePage = page;
      page.setDefaultTimeout(10000);
      const errors = [],
        writes = [],
        unexpected = [];
      let scenario = 'missing';
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(
        (url) => url.pathname.startsWith('/api/'),
        async (route) => {
          const path = new URL(route.request().url()).pathname;
          if (route.request().method() !== 'GET') {
            writes.push(path);
            return route.abort();
          }
          if (path.endsWith('/risk/monitoring')) return route.fulfill({ json: status(scenario) });
          if (path.endsWith('/risk/rules')) return route.fulfill({ json: rules });
          if (path.endsWith('/risk/events') || path.endsWith('/notifications'))
            return route.fulfill({ json: [] });
          if (path.endsWith('/routing/risk'))
            return route.fulfill({
              json: {
                availableRoutes: [{ provider: '飞书', channel: 'feishu', priority: 1 }],
                selectedProviders: ['飞书'],
                updatedAt: null,
              },
            });
          unexpected.push(path);
          return route.abort();
        },
      );
      for (scenario of Object.keys(reasons)) {
        const url =
          surface === 'desktop'
            ? `${process.env.RISK_RULE_QA_ORIGIN ?? 'http://127.0.0.1:5173'}/test/browser-strategy-rule-notification.html?mode=overview-list`
            : `${mobileOrigin}/test/browser-risk-notification.html?mode=monitoring`;
        await page.goto(url);
        if (scenario === 'healthy') {
          const expected =
            surface === 'desktop' ? '2 条生效规则自动评估中' : '自动评估已启用的风险规则';
          await page.getByText(expected, { exact: surface === 'desktop' }).waitFor();
        } else {
          for (const [, reason] of reasons[scenario])
            await page
              .getByText(new RegExp(reason.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
              .first()
              .waitFor();
        }
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
        );
        if (['missing', 'calendar'].includes(scenario))
          await page.screenshot({
            path: `${output}/${surface}-${scenario}-${width}.png`,
            fullPage: true,
            animations: 'disabled',
          });
      }
      assert.deepEqual(errors, []);
      assert.deepEqual(writes, []);
      assert.deepEqual(unexpected, []);
      console.log(
        JSON.stringify({
          surface,
          width,
          scenarios: Object.keys(reasons).length,
          status: '通过',
          writes: 0,
        }),
      );
      await page.close();
    }
} catch (error) {
  if (activePage && !activePage.isClosed())
    await activePage.screenshot({
      path: `${output}/failure.png`,
      fullPage: true,
      animations: 'disabled',
    });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
