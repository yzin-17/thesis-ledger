import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { aiFrozenResearchV2Schema } from '../src/ai-frozen-research-v2.js';
import { researchScopeSnapshotV2Schema } from '../src/research-scope-v2.js';
import {
  researchPortfolioMaterialV2Schema,
  researchStrategyMaterialV2Schema,
  researchPrivateMaterialMatchesScopeV2,
} from '../src/research-private-material-v2.js';
import { researchV2Fixture } from './fixtures/research-v2.js';

function fixture() {
  const raw = JSON.parse(
    readFileSync(new URL('../fixtures/research-private-v2.samples.json', import.meta.url), 'utf8'),
  ) as { portfolio: unknown; strategy: unknown };
  const portfolio = researchPortfolioMaterialV2Schema.parse(raw.portfolio);
  const strategy = researchStrategyMaterialV2Schema.parse(raw.strategy);
  const { frozen } = researchV2Fixture();
  if (frozen.scopeSnapshot.scope !== 'instrument') throw new Error('公开范围样例缺失');
  const scope = researchScopeSnapshotV2Schema.parse({
    version: 'research-scope-v2',
    mode: 'shadow',
    scope: 'account',
    confirmedAt: frozen.scopeSnapshot.confirmedAt,
    accountId: portfolio.accounts[0]!.accountId,
    instruments: [frozen.scopeSnapshot.instrument],
  });
  return { portfolio, strategy, frozen, scope };
}
it('账本材料保存实际十进制字符串并绑定本次账户集合', () => {
  const f = fixture();
  expect(researchPrivateMaterialMatchesScopeV2(f.portfolio, f.scope, 'portfolio')).toBe(true);
  expect(f.portfolio.positions[0]!.quantity).toBe('2.0000001');
});
it.each(['mode', 'account', 'position-owner', 'symbol', 'kind'] as const)(
  '越界的 %s 私人材料不能用于冻结范围',
  (kind) => {
    const f = fixture();
    const value = structuredClone(f.portfolio);
    if (kind === 'mode') value.mode = 'actual';
    else if (kind === 'account')
      value.accounts[0]!.accountId = '00000000-0000-4000-8000-000000000011';
    else if (kind === 'position-owner')
      value.positions[0]!.accountId = '00000000-0000-4000-8000-000000000011';
    else if (kind === 'symbol') value.positions[0]!.symbol = 'AAPL.US';
    expect(
      researchPrivateMaterialMatchesScopeV2(
        value,
        f.scope,
        kind === 'kind' ? 'strategy' : 'portfolio',
      ),
    ).toBe(false);
  },
);
it('只有显式未解析的原持仓可保留未知身份，不能加入无关未知项', () => {
  const f = fixture();
  f.portfolio.positions[0]!.symbol = 'UNKNOWN';
  f.portfolio.unresolvedSymbols = ['UNKNOWN'];
  expect(researchPrivateMaterialMatchesScopeV2(f.portfolio, f.scope, 'portfolio')).toBe(true);
  f.portfolio.unresolvedSymbols.push('OTHER');
  expect(researchPrivateMaterialMatchesScopeV2(f.portfolio, f.scope, 'portfolio')).toBe(false);
});
it('持仓范围只能携带选定的一条持仓', () => {
  const f = fixture();
  if (f.scope.scope !== 'account') throw new Error('受控账户范围缺失');
  const scope = researchScopeSnapshotV2Schema.parse({
    version: f.scope.version,
    mode: f.scope.mode,
    confirmedAt: f.scope.confirmedAt,
    accountId: f.scope.accountId,
    scope: 'position',
    instrument: f.scope.instruments[0],
  });
  f.portfolio.scope = 'position';
  expect(researchPrivateMaterialMatchesScopeV2(f.portfolio, scope, 'portfolio')).toBe(true);
  f.portfolio.positions.push({ ...f.portfolio.positions[0]!, symbol: 'AAPL.US' });
  expect(researchPrivateMaterialMatchesScopeV2(f.portfolio, scope, 'portfolio')).toBe(false);
});
it('策略按实际 DSL 合同与不可变版本身份匹配，不能换版本或材料种类', () => {
  const f = fixture();
  if (f.scope.scope !== 'account') throw new Error('受控范围缺失');
  const scope = researchScopeSnapshotV2Schema.parse({
    version: f.scope.version,
    mode: f.scope.mode,
    confirmedAt: f.scope.confirmedAt,
    instruments: f.scope.instruments,
    scope: 'strategy',
    strategyVersionId: f.strategy.strategyVersionId,
  });
  expect(researchPrivateMaterialMatchesScopeV2(f.strategy, scope, 'strategy')).toBe(true);
  expect(researchPrivateMaterialMatchesScopeV2(f.strategy, scope, 'portfolio')).toBe(false);
  f.strategy.strategyVersionId = '00000000-0000-4000-8000-000000000022';
  expect(researchPrivateMaterialMatchesScopeV2(f.strategy, scope, 'strategy')).toBe(false);
});
it('重复账户/持仓以及策略 schema 版本不一致均拒绝', () => {
  const f = fixture();
  expect(
    researchPortfolioMaterialV2Schema.safeParse({
      ...f.portfolio,
      accounts: [...f.portfolio.accounts, f.portfolio.accounts[0]],
    }).success,
  ).toBe(false);
  expect(
    researchPortfolioMaterialV2Schema.safeParse({
      ...f.portfolio,
      positions: [...f.portfolio.positions, f.portfolio.positions[0]],
    }).success,
  ).toBe(false);
  expect(
    researchStrategyMaterialV2Schema.safeParse({ ...f.strategy, schemaVersion: 3 }).success,
  ).toBe(false);
});
it('现金只有匹配的非零投影代次和修订证明才能标为当前', () => {
  const f = fixture();
  const balance = {
    accountId: f.portfolio.accounts[0]!.accountId,
    currency: 'CNY',
    settledAmount: '100',
    pendingReceivable: '0',
    pendingPayable: '0',
    completeness: 'complete',
    issues: [],
    projectionGeneration: '2',
    asOfLedgerRevision: '3',
    asOfProjectionGeneration: '2',
    projectionStatus: 'current',
    updatedAt: '2026-10-18T07:00:00Z',
  };
  expect(
    researchPortfolioMaterialV2Schema.safeParse({ ...f.portfolio, cashBalances: [balance] })
      .success,
  ).toBe(true);
  for (const patch of [
    { asOfLedgerRevision: null },
    { asOfProjectionGeneration: '3' },
    { projectionGeneration: '0', asOfProjectionGeneration: '0' },
  ])
    expect(
      researchPortfolioMaterialV2Schema.safeParse({
        ...f.portfolio,
        cashBalances: [{ ...balance, ...patch }],
      }).success,
    ).toBe(false);
});
it('冻结包在共享序列化边界也拒绝跨账户或跨材料种类', () => {
  const f = fixture();
  f.frozen.request.scope = { scope: 'account', accountId: f.portfolio.accounts[0]!.accountId };
  f.frozen.scopeSnapshot = f.scope;
  const entry = f.frozen.evidence[0]!;
  entry.audit.kind = 'portfolio';
  entry.data = JSON.parse(JSON.stringify(f.portfolio)) as typeof entry.data;
  expect(aiFrozenResearchV2Schema.safeParse(f.frozen).success).toBe(true);
  entry.audit.kind = 'strategy';
  expect(aiFrozenResearchV2Schema.safeParse(f.frozen).success).toBe(false);
});
