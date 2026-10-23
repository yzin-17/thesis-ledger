import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  desiredProviderPolicyV3Schema,
  marketRouteKeyIdV3,
  fundNavSchema,
  fundHoldingsSchema,
} from '../packages/schemas/dist/index.js';
import { fundPolicyFingerprint } from './fund-nav-route-case.mjs';

export const disclosureFund = '161725.OF';
export const disclosureChannel = 'fund-disclosure-acceptance';
const keys = ['FUND_NAV', 'FUND_HOLDINGS'].map((capability) => ({
  kind: 'data',
  market: 'CN',
  assetType: 'MUTUAL_FUND',
  capability,
}));
const targetForKey = (key) => ({
  providerId: key.capability === 'FUND_HOLDINGS' ? 'akshare' : 'efinance',
  upstreamSource: 'eastmoney',
});
export const disclosurePolicy = (state) =>
  desiredProviderPolicyV3Schema.parse({
    contractVersion: state.contractVersion,
    consumer: state.consumer,
    requestId: state.requestId,
    revision: state.revision,
    enabled: state.enabled,
    routes: state.routes,
  });
export function createDisclosurePlan(state, providers, catalog, baseline) {
  assert(
    state.syncState === 'applied' && !state.effectiveStale && state.dsaRevision === state.revision,
  );
  const versions = {};
  assert.equal(catalog.status, 'complete');
  const original = disclosurePolicy(state);
  for (const key of keys) {
    const target = targetForKey(key);
    const provider = providers.find((p) => p.providerId === target.providerId);
    assert(provider?.enabled && provider.configured);
    versions[target.providerId] = provider.configVersion;
    const id = marketRouteKeyIdV3(key);
    assert(!original.routes.some((r) => marketRouteKeyIdV3(r.key) === id), '已有路由禁止接管');
    const choices = catalog.entries.filter(
      (e) =>
        marketRouteKeyIdV3(e.key) === id &&
        e.target.providerId === target.providerId &&
        e.target.upstreamSource === target.upstreamSource,
    );
    assert(choices.length === 1 && choices[0].state === 'ready');
  }
  assert.equal(baseline.identity.asset.identityStatus, 'confirmed');
  const caseId = randomUUID();
  const plan = {
    format: 'fund-disclosure-acceptance-v1',
    caseId,
    symbol: disclosureFund,
    accountName: `基金分钟披露验收-20261021-${caseId.slice(0, 8)}`,
    baseline,
    providerConfigVersions: versions,
    original,
    temporary: disclosurePolicy({
      ...original,
      revision: original.revision + 1,
      requestId: randomUUID(),
      routes: [...original.routes, ...keys.map((key) => ({ key, targets: [targetForKey(key)] }))],
    }),
  };
  assertDisclosurePlan(plan);
  return plan;
}
export function assertDisclosurePlan(plan) {
  assert.equal(plan.format, 'fund-disclosure-acceptance-v1');
  assert.match(plan.caseId, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(plan.symbol, disclosureFund);
  if (plan.adjustedPriceCase) {
    assert.equal(plan.adjustedPriceCase, true);
    assert(plan.sourceReuse?.path && /^[0-9a-f]{64}$/.test(plan.sourceReuse.sha256));
  } else assert(!plan.sourceReuse);
  assert.equal(plan.accountName, `基金分钟披露验收-20261021-${plan.caseId.slice(0, 8)}`);
  const original = disclosurePolicy(plan.original),
    temporary = disclosurePolicy(plan.temporary);
  assert.equal(temporary.revision, original.revision + 1);
  assert(original.enabled);
  for (const name of ['akshare', 'efinance'])
    assert(
      Number.isSafeInteger(plan.providerConfigVersions[name]) &&
        plan.providerConfigVersions[name] >= 0,
    );
  for (const key of keys)
    assert(!original.routes.some((r) => marketRouteKeyIdV3(r.key) === marketRouteKeyIdV3(key)));
  assert.equal(
    fundPolicyFingerprint(temporary),
    fundPolicyFingerprint({
      ...original,
      routes: [...original.routes, ...keys.map((key) => ({ key, targets: [targetForKey(key)] }))],
    }),
  );
}
export function assertQualifiedDisclosureSource(prior, now = Date.now()) {
  assert.equal(prior.phase, 'passed');
  assert.equal(prior.protection.passed, true);
  assert.equal(prior.web.minuteSeriesObserved, true);
  assert.equal(prior.plan.symbol, disclosureFund);
  const observed = Date.parse(prior.source.capturedAt);
  assert(Number.isFinite(observed) && now >= observed && now - observed <= 24 * 60 * 60_000);
  const nav = fundNavSchema.parse(prior.source.nav);
  const holdings = fundHoldingsSchema.parse(prior.source.holdings);
  assert(nav.symbol === disclosureFund && nav.unitNav > 0 && nav.freshness === 'delayed');
  assert.equal(nav.provider, 'efinance');
  assert(
    holdings.fundSymbol === disclosureFund && holdings.disclosureEvidence?.status === 'matched',
  );
  assert.equal(holdings.provider, 'akshare');
  for (const value of [nav, holdings])
    assert(value.fallbackUsed === false && value.servedFromCache === false);
  const paths = prior.source.observations.map((o) => o.path);
  assert.equal(paths.length, 2);
  for (const [kind, schema, value] of [
    ['fund-nav', fundNavSchema, nav],
    ['fund-holdings', fundHoldingsSchema, holdings],
  ]) {
    const found = prior.source.observations.filter(
      (o) => o.path === `/api/v3/thesis-ledger/market/${kind}?symbol=161725.OF`,
    );
    assert.equal(found.length, 1);
    const raw = schema.parse(found[0].raw),
      expected = { ...value };
    delete raw.servedFromCache;
    delete expected.servedFromCache;
    assert.deepEqual(raw, expected, '保留的标准结果必须对应原实源原响应');
  }
}
export function assertDisclosureAccount(account, plan) {
  assert.match(account.id, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(account.name, plan.accountName);
  assert.equal(account.mode, 'actual');
  assert.equal(account.type, 'fund');
  assert.equal(account.currency, 'CNY');
}
export function assertDisclosureLedger(events, plan) {
  assert(events.length <= 8);
  const ids = new Set();
  for (const event of events) {
    assert.equal(event.actorId, plan.caseId);
    assert.equal(event.sourceChannel, disclosureChannel);
    assert(
      ['deposit', 'buy', 'sell', 'withdraw', 'deposit2', 'buy2', 'sell2', 'withdraw2'].some(
        (key) => event.externalId === `${plan.caseId}:${key}`,
      ),
    );
    assert(!ids.has(event.externalId));
    ids.add(event.externalId);
  }
}
export function assertDisclosureBarsRepair(record, now = Date.now()) {
  assert.equal(record.phase, 'recovery-required');
  assert.equal(record.failure, '真实底层价格覆盖不足，保留来源结果，不创建账户');
  assert(!record.account && !record.creationStarted && !record.barsRepairStarted);
  assert.equal(record.source.holdings.disclosureEvidence.status, 'matched');
  assert(
    now - Date.parse(record.prices.capturedAt) >= 0 &&
      now - Date.parse(record.prices.capturedAt) <= 15 * 60_000,
  );
  const positive = record.source.holdings.holdings.filter((h) => h.weight > 0);
  assert(positive.length > 0 && positive.length <= 20);
  for (const holding of positive) {
    const value = record.prices.prices[holding.symbol];
    assert.equal(value.httpStatus, 400);
    assert.equal(value.raw.message, 'start 必须是 YYYY-MM-DD 日期');
    assert(!value.bars && value.quote.price > 0);
  }
}
export function assertDisclosureSampleRecovery(record, state, now = Date.now()) {
  assert.equal(record.phase, 'recovery-required');
  assert.equal(record.failure, '目标 sample 缺少有限回执');
  assert(!record.sampleRepairStarted && record.settled && record.protection.passed);
  assert.equal(state.owned.account.id, record.account.id);
  assert.equal(state.owned.account.active, false);
  assert.equal(state.owned.quantity, 0);
  assert.equal(state.owned.cashValue, 0);
  assert.equal(state.owned.events.length, 4);
  assertDisclosureLedger(state.owned.events, record.plan);
  assert.equal(state.points.length, 1);
  assert.equal(state.points[0].dataQuality, 'COMPLETE');
  assert.equal(
    state.points[0].evidence.funds[0].evidenceVersion,
    record.source.holdings.evidenceVersion,
  );
  assert(now - Date.parse(record.prices.capturedAt) <= 15 * 60_000);
}
export async function restoreDisclosurePolicy(api, plan) {
  assertDisclosurePlan(plan);
  const current = await api('GET', '/api/market-data/policy');
  const fingerprint = fundPolicyFingerprint(current);
  if (plan.sourceReuse)
    assert.equal(fingerprint, fundPolicyFingerprint(plan.original), '复用验收未取得路由写入所有权');
  if (fingerprint !== fundPolicyFingerprint(plan.original)) {
    assert.equal(current.revision, plan.temporary.revision);
    assert.equal(current.requestId, plan.temporary.requestId);
    assert.equal(fingerprint, fundPolicyFingerprint(plan.temporary), '政策并行变化，禁止覆盖');
    await api('PUT', '/api/market-data/policy', {
      ...plan.original,
      revision: current.revision + 1,
      expectedRevision: current.revision,
      requestId: randomUUID(),
    });
  }
  const after = await api('GET', '/api/market-data/policy');
  assert.equal(fundPolicyFingerprint(after), fundPolicyFingerprint(plan.original));
  assert(
    after.syncState === 'applied' && !after.effectiveStale && after.dsaRevision === after.revision,
  );
  return {
    revision: after.revision,
    routes: after.routes.length,
    originalRouteChoicesRestored: true,
  };
}
