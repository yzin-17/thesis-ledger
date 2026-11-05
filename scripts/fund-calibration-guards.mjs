import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { createFundNavPlan, assertFundNavPlan, fundSymbol } from './fund-nav-route-case.mjs';

export const fundCaseFormat = 'owned-fund-calibration-v1';
export const fundCaseChannel = 'fund-calibration-acceptance';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export function assertCaseUuid(id) {
  assert(uuidPattern.test(id), '必须为精确 UUID');
}

export function createFundCalibrationPlan(state, providers, catalog, identity, baseline, root) {
  const routePlan = createFundNavPlan(state, providers, catalog);
  const { asset, instrument, association } = identity;
  assert(asset?.symbol === fundSymbol && asset.assetType === 'fund' && asset.currency === 'CNY');
  assert(['provider', 'confirmed'].includes(asset.identityStatus));
  assert(
    instrument?.canonicalCode === '161725' &&
      instrument.instrumentType === 'MUTUAL_FUND' &&
      instrument.market === 'OF' &&
      instrument.active === true,
  );
  assertCaseUuid(instrument.id);
  assert(!association || association.instrumentId === instrument.id, '不接管其他目录身份关联');
  const caseId = randomUUID(),
    token = caseId.slice(0, 8);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date());
  return {
    format: fundCaseFormat,
    caseId,
    routePlan,
    identity,
    baseline,
    accountName: `基金正式校准验收-${date.replaceAll('-', '')}-${token}`,
    output: `${root}/.recovery-artifacts/fund-calibration-${date.replaceAll('-', '')}-${token}`,
    requiresExplicitAuthorization: true,
    writes: {
      account: { type: 'fund', mode: 'actual', currency: 'CNY' },
      confirmAsset:
        asset.identityStatus !== 'confirmed' ||
        asset.identitySource !== 'catalog' ||
        association?.status !== 'active',
      cashDeposit: '1000',
      quantity: '100',
      price: '1.25',
      capabilityVerification: 'UNVERIFIED',
      snapshots: '仅本次账户：估算、冻结后清仓停用、正式追加与同值幂等',
      valuationDate: '本次最新合格 NAV 的净值日；历史只读该日',
      serverFundDataGetsAtMost: 4,
      cleanup: '仅本次账户结清份额和现金、停用，保留全部新审计与快照；原路由恢复',
      assetIdentityEffect:
        '如需目录确认，仅该 Asset 的 identityStatus/identitySource/updatedAt 和对应关联持久变化',
      web: '必要时仅临时重新启用已结清的本次账户以只读查看日级点，完成后停用',
    },
  };
}

export function assertFundCalibrationPlan(plan) {
  assert.equal(plan.format, fundCaseFormat);
  assertCaseUuid(plan.caseId);
  assertFundNavPlan(plan.routePlan);
  assert.match(
    plan.accountName,
    new RegExp(`^基金正式校准验收-\\d{8}-${plan.caseId.slice(0, 8)}$`),
  );
  assert.deepEqual(plan.writes.account, { type: 'fund', mode: 'actual', currency: 'CNY' });
  assert.equal(plan.writes.cashDeposit, '1000');
  assert.equal(plan.writes.quantity, '100');
  assert.equal(plan.writes.price, '1.25');
  assert.equal(plan.writes.capabilityVerification, 'UNVERIFIED');
  assert.equal(plan.writes.serverFundDataGetsAtMost, 4);
  assert.equal(plan.requiresExplicitAuthorization, true);
  assert(
    plan.identity.asset.symbol === fundSymbol &&
      plan.identity.asset.assetType === 'fund' &&
      plan.identity.asset.currency === 'CNY',
  );
  assertCaseUuid(plan.identity.instrument.id);
  assert(
    plan.identity.instrument.canonicalCode === '161725' &&
      plan.identity.instrument.instrumentType === 'MUTUAL_FUND' &&
      plan.identity.instrument.market === 'OF' &&
      plan.identity.instrument.active === true,
  );
  assert.equal(
    plan.writes.confirmAsset,
    plan.identity.asset.identityStatus !== 'confirmed' ||
      plan.identity.asset.identitySource !== 'catalog' ||
      plan.identity.association?.status !== 'active',
  );
}

export function assertFundCaseAccount(account, plan, expectedId) {
  assertFundCalibrationPlan(plan);
  assertCaseUuid(expectedId);
  assert(
    account?.id === expectedId &&
      account.name === plan.accountName &&
      account.type === 'fund' &&
      account.mode === 'actual' &&
      account.currency === 'CNY',
    '账户所有权或类型不符',
  );
}

export function assertFundCaseLedger(events, plan) {
  assert(events.length <= 4, '自有账户存在额外事件，停止清理');
  const externalIds = new Set();
  for (const row of events) {
    assert(
      row.sourceChannel === fundCaseChannel &&
        row.actorId === plan.caseId &&
        ['deposit', 'buy', 'sell', 'withdraw'].some(
          (key) => row.externalId === `${plan.caseId}:${key}`,
        ) &&
        !externalIds.has(row.externalId),
      '自有账户存在范围外记账，停止清理',
    );
    externalIds.add(row.externalId);
  }
}

export function assertFundAssetTransition(before, after, association, plan) {
  const stable = (row) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => !['identityStatus', 'identitySource', 'updatedAt'].includes(key),
      ),
    );
  assert(isDeepStrictEqual(stable(before), stable(after)), '资产存在确认范围外变化');
  assert(after.identityStatus === 'confirmed' && after.identitySource === 'catalog');
  assert(
    association?.instrumentId === plan.identity.instrument.id &&
      association.symbol === fundSymbol &&
      association.status === 'active' &&
      association.source === 'catalog' &&
      association.confirmedAt,
  );
  assertCaseUuid(association.id);
  if (plan.identity.association) {
    assert.equal(association.id, plan.identity.association.id);
    assert.equal(association.firstSeenAt, plan.identity.association.firstSeenAt);
  }
}

export function ownedFundProtectionSql(accountId) {
  if (accountId !== undefined) assertCaseUuid(accountId);
  const tables = {
    Account: 'id',
    AccountLedgerState: 'accountId',
    LedgerEvent: 'accountId',
    PortfolioSnapshot: 'accountId',
    Strategy: null,
    StrategyVersion: null,
    BacktestJob: null,
    Position: 'accountId',
    Trade: 'accountId',
    CashBalance: 'accountId',
    CashSettlement: 'accountId',
    ProviderConfig: null,
    AiRoutingSettings: null,
  };
  return `SELECT json_build_object(${Object.entries(tables)
    .map(
      ([table, field]) =>
        `'${table}',(SELECT md5(coalesce(string_agg(to_jsonb(t)::text,'' ORDER BY to_jsonb(t)::text),'')) FROM "${table}" t${
          accountId && field ? ` WHERE "${field}" IS DISTINCT FROM '${accountId}'::uuid` : ''
        })`,
    )
    .join(',')});`;
}
