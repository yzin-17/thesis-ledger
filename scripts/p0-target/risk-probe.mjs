import assert from 'node:assert/strict';
import { PrismaClient } from '@prisma/client';
import 'reflect-metadata';

const root = '/app/apps/server/dist/src';
const { AutomationRuntimeHandlers } = await import(`${root}/automation/automation-runtime.service.js`);
const { AutomationService } = await import(`${root}/automation/automation.service.js`);
const { AutomationWorkflowRunner } = await import(`${root}/automation/workflow-runner.service.js`);
const { RiskService } = await import(`${root}/risk/risk.service.js`);
const url = new URL(process.env.P0_DATABASE_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/p0_risk_fixture');
assert.equal(url.username, 'fixture_owner');
const prisma = new PrismaClient({ datasourceUrl: url.toString() });
const at = new Date('2026-10-18T08:00:00.000Z');
const outcomes = [];
const notificationCaptures = [];
const notifications = {
  enqueue: async (...args) => { notificationCaptures.push(args); return []; },
  subjectDeliveryStatus: async () => ({ shouldRetry: false }),
};
const flags = { missingPrice: false, missingFx: false, quoteFailure: null, fxFailure: null, navFreshness: 'delayed' };
const market = {
  getQuote: async (symbol) => {
    if (flags.missingPrice && symbol === 'RVC_CNY.SH') throw new Error('受控缺价');
    const usd = symbol === 'RVC_USD.US';
    return { symbol, price: usd ? 100 : 700,
      marketTime: flags.quoteFailure === 'future' ? '2026-10-19T08:00:00Z' : at.toISOString(),
      provider: 'controlled-not-live', freshness: flags.quoteFailure === 'unknown' ? 'unknown' : 'live',
      stale: flags.quoteFailure === 'stale', units: { priceCurrency: usd ? 'USD' : 'CNY' } };
  },
  getFundNav: async (symbol) => ({ symbol, unitNav: 1.23, navDate: '2026-10-17T00:00:00Z',
    provider: 'controlled-not-live-nav', freshness: flags.navFreshness }),
  getFxRates: async () => ({ version: 3, baseCurrency: 'CNY', asOf: '2026-10-18',
    fetchedAt: at.toISOString(), maxAgeDays: 3,
    rates: [{ fromCurrency: 'USD', toCurrency: 'CNY', rate: flags.missingFx ? undefined : 7,
      available: !flags.missingFx, rateDate: flags.fxFailure === 'future' ? '2026-10-19' : '2026-10-18', provider: 'controlled-not-live',
      ageDays: flags.fxFailure === 'unknown-age' ? null : 0,
      freshness: flags.missingFx ? 'unavailable' : 'live', stale: flags.fxFailure === 'stale' }] }),
};
try {
  assert.deepEqual(await prisma.$queryRaw`SELECT current_database() AS database, current_user AS owner`,
    [{ database: 'p0_risk_fixture', owner: 'fixture_owner' }]);
  await prisma.riskRule.updateMany({ data: { enabled: false } });
  const accounts = [];
  for (const name of ['甲', '乙']) accounts.push(await prisma.account.create({
    data: { name: `P0 目标风险验收${name}`, type: 'securities', mode: 'actual' },
  }));
  for (const [symbol, currency, account] of [
    ['RVC_USD.US', 'USD', accounts[0]], ['RVC_CNY.SH', 'CNY', accounts[1]],
  ]) {
    await prisma.asset.create({ data: { symbol, currency, name: '明示合成输入', assetType: 'stock', market: currency === 'USD' ? 'US' : 'CN' } });
    await prisma.position.create({ data: { symbol, accountId: account.id, quantity: 1, costPrice: 100, source: 'p0-target-synthetic' } });
  }
  const base = { version: 1, scope: 'security', severity: 'warning', enabled: true, symbol: 'RVC_USD.US', needsRepair: false };
  const global = await prisma.riskRule.create({ data: { ...base, kind: 'position-concentration', threshold: 0.4 } });
  const local = await prisma.riskRule.create({ data: { ...base, kind: 'position-concentration', threshold: 0.4, accountId: accounts[0].id } });
  const price = await prisma.riskRule.create({ data: { ...base, kind: 'price-below', threshold: 150 } });
  const risk = new RiskService(prisma, notifications);
  const workflows = new AutomationWorkflowRunner({}, {}, risk, prisma, market);
  let captured = [];
  const originalScan = workflows.riskScan.bind(workflows);
  workflows.riskScan = async (...args) => {
    captured.push(structuredClone(args[0]));
    return originalScan(...args);
  };
  const handlers = new AutomationRuntimeHandlers(prisma, workflows, market, {}, {}, {}, {});
  const automations = new AutomationService(prisma, {}, notifications);
  const job = await prisma.automationJob.create({ data: { name: 'P0 目标风险验收', type: 'risk-evaluation',
    cron: '0 0 * * *', timezone: 'Asia/Shanghai', enabled: false, lockTtlMs: 30000,
    retryPolicy: { maxAttempts: 1, backoffMs: 1 } } });
  const run = () => automations.execute(job.id, handlers.for('risk-evaluation'), at);
  const complete = await run();
  assert.equal(complete.output.valuation.portfolioComplete, true);
  const events = await prisma.riskEvent.findMany({ where: { ruleId: { in: [global.id, local.id] } } });
  assert.equal(events.length, 2);
  for (const event of events) {
    assert.equal(event.context.value, event.ruleId === local.id ? 1 : 0.5);
    assert.equal(event.triggered, true);
  }
  outcomes.push('100 USD 与 700 CNY 按汇率 7 分别为 50%，独立账户为 100%；实际规则写入事件');
  for (const failure of ['missingPrice', 'missingFx']) {
    flags[failure] = true;
    notificationCaptures.length = 0;
    const state = await prisma.riskRuleTriggerState.findFirstOrThrow({ where: { ruleId: global.id } });
    const count = await prisma.riskEvent.count({ where: { ruleId: global.id } });
    const result = await run();
    assert.equal(result.output.valuation.portfolioComplete, false);
    assert(result.output.results.some((item) => item.ruleId === global.id && item.error.includes('组合权重不可用')));
    assert.deepEqual(await prisma.riskRuleTriggerState.findUniqueOrThrow({ where: { id: state.id } }), state);
    assert.equal(await prisma.riskEvent.count({ where: { ruleId: global.id } }), count);
    assert(!notificationCaptures.some(([subject]) => subject.id === state.activeEventId));
    const independent = await prisma.riskRuleTriggerState.findMany({ where: { ruleId: { in: [local.id, price.id] } } });
    assert.equal(independent.length, 2);
    assert(independent.every((item) => item.activeEventId !== null));
    assert(JSON.stringify(await automations.history(job.id)).includes('组合权重不可用'));
    flags[failure] = false;
    outcomes.push(`${failure}：既有风险状态及事件不被解除，独立账户/价格规则继续评估，历史保留原因`);
  }
  for (const failure of ['stale', 'future', 'unknown']) {
    flags.quoteFailure = failure; captured = []; await run();
    const contexts = captured.flat();
    assert.equal(contexts.length, 2);
    assert(contexts.every((item) => item.price === undefined && item.weight === undefined));
  }
  flags.quoteFailure = null;
  for (const failure of ['stale', 'future', 'unknown-age']) {
    flags.fxFailure = failure; captured = []; await run();
    const contexts = captured.flat();
    assert(contexts.every((item) => item.weight === undefined && item.accountWeight === 1));
  }
  flags.fxFailure = null;
  outcomes.push('陈旧/未来/未知行情，以及陈旧/未来/未知年龄 FX 均不获得权重；完整单币账户独立可用');
  const shadow = await prisma.account.create({ data: { name: 'P0 模拟范围', type: 'securities', mode: 'shadow' } });
  await prisma.position.create({ data: { symbol: 'RVC_USD.US', accountId: shadow.id, quantity: 1000, costPrice: 100, source: 'p0-target-synthetic' } });
  captured = []; await run();
  const actual = captured.flat().filter((item) => item.accountId !== shadow.id);
  const simulated = captured.flat().filter((item) => item.accountId === shadow.id);
  assert.deepEqual(actual.map((item) => item.weight), [0.5, 0.5]);
  assert.equal(simulated.length, 1); assert.equal(simulated[0].weight, 1);
  await prisma.position.updateMany({ data: { quantity: 0 } });
  captured = []; await run();
  assert(captured.flat().every((item) => item.weight === undefined));
  outcomes.push('真实/模拟持仓分别估值；零分母不伪造零比例');
  await prisma.riskRule.updateMany({ data: { enabled: false } });
  await prisma.position.deleteMany();
  const fund = await prisma.asset.create({ data: { symbol: 'P0_NAV.OF', currency: 'CNY', name: '合成正式 NAV', assetType: 'fund', market: 'CN' } });
  await prisma.position.create({ data: { symbol: fund.symbol, accountId: accounts[0].id, quantity: 1, costPrice: 1, source: 'p0-target-synthetic' } });
  captured = []; await run(); assert.equal(captured.flat()[0].weight, 1);
  for (const freshness of ['stale', 'unavailable']) {
    flags.navFreshness = freshness; captured = []; await run();
    assert.equal(captured.flat()[0].weight, undefined);
  }
  flags.navFreshness = 'delayed';
  await prisma.asset.update({ where: { symbol: fund.symbol }, data: { currency: 'USD' } });
  captured = []; await run(); assert.equal(captured.flat()[0].weight, undefined);
  outcomes.push('正式 NAV 正向估值；陈旧/不可用 NAV 及币种不匹配保留未知');
  assert.equal(await prisma.notificationDelivery.count(), 0);
  console.log('P0_RESULT ' + JSON.stringify({ gate: 'RVCG', outcomes, externalDeliveries: 0, realModelCalls: 0 }));
} finally {
  await prisma.$disconnect();
}
