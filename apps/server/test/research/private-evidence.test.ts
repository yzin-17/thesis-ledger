import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { z } from 'zod';
import {
  aiFrozenResearchV2Schema,
  researchPortfolioMaterialV2Schema,
  researchStrategyMaterialV2Schema,
  researchScopeSnapshotV2Schema,
  researchGenerationV2Schema,
  type ResearchFrozenEvidenceV2,
} from '@thesis-ledger/schemas';
import { finalizeResearchMaterials } from '../../src/research/research-material-preparation.js';
import { privateResearchEvidence } from '../../src/research/research-private-evidence.js';
import {
  sealAiFrozenResearchV2,
  verifyAiFrozenResearchV2,
} from '../../src/ai/ai-research-frozen-integrity-v2.js';
import { verifyResearchNumericEvidenceV2 } from '../../src/ai/ai-research-numeric-evidence-v2.js';
import { submissionV2Fixture } from '../ai/research-submission-v2.fixture.js';

function fixture() {
  const sample = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/research-private-v2.samples.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as { portfolio: unknown; strategy: unknown };
  const inference = JSON.parse(
    readFileSync(
      new URL('../../../../packages/schemas/fixtures/research-v2.samples.json', import.meta.url),
      'utf8',
    ),
  ) as { generation: unknown };
  const { frozen } = submissionV2Fixture();
  const material = researchPortfolioMaterialV2Schema.parse(sample.portfolio);
  const strategy = researchStrategyMaterialV2Schema.parse(sample.strategy);
  if (frozen.scopeSnapshot.scope !== 'instrument') throw new Error('受控公开标的缺失');
  const instrument = frozen.scopeSnapshot.instrument;
  const snapshot = researchScopeSnapshotV2Schema.parse({
    version: 'research-scope-v2',
    mode: 'shadow',
    scope: 'account',
    accountId: material.accounts[0]!.accountId,
    instruments: [instrument],
    confirmedAt: frozen.scopeSnapshot.confirmedAt,
  });
  const quote: ResearchFrozenEvidenceV2 = {
    ...structuredClone(frozen.evidence[0]!),
    required: false,
  };
  const context = {
    scopeSnapshot: snapshot,
    privateMaterial: material,
    fetchedAt: '2026-10-18T07:59:30Z',
    reasons: [],
  };
  return {
    frozen,
    material,
    strategy,
    instrument,
    snapshot,
    quote,
    context,
    inference: researchGenerationV2Schema.parse(inference.generation),
  };
}
it('实际私人材料经过范围、指纹、可用性和精确数值消费，不依赖模型补绑定', () => {
  const f = fixture();
  const prepared = finalizeResearchMaterials(
    f.context,
    [{ instrument: f.instrument, evidence: [f.quote] }],
    false,
  );
  f.frozen.request.scope = { scope: 'account', accountId: f.material.accounts[0]!.accountId };
  f.frozen.request.templateId = 'primary-risks';
  f.frozen.scopeSnapshot = prepared.scopeSnapshot;
  f.frozen.evidence = prepared.evidence;
  f.frozen.quality = { status: 'partial', reasons: ['cash_balance_unrecorded'] };
  const sealed = sealAiFrozenResearchV2(f.frozen);
  expect(verifyAiFrozenResearchV2(sealed).scopeSnapshot).toEqual(prepared.scopeSnapshot);
  f.inference.numericClaims = [
    {
      id: 'quantity',
      description: '原始持仓数量',
      kind: 'field',
      source: {
        evidenceId: prepared.evidence[0]!.audit.evidenceId,
        fieldPath: '/positions/0/quantity',
        value: 2.0000001,
        unit: 'position-unit',
        currency: null,
      },
    },
  ];
  expect(verifyResearchNumericEvidenceV2(sealed, f.inference)).toEqual(f.inference);
  const claim = f.inference.numericClaims[0]!;
  if (claim.kind !== 'field') throw new Error('受控数值引用缺失');
  claim.source.value = 3;
  expect(() => verifyResearchNumericEvidenceV2(sealed, f.inference)).toThrow();
});
it('未取得合格价格币种时保留原持仓未知，不把市场默认值写成已知规范身份', () => {
  const f = fixture();
  f.quote.usable = false;
  f.quote.status = 'partial';
  f.quote.reasons = ['quote_currency_unknown'];
  const prepared = finalizeResearchMaterials(
    f.context,
    [{ instrument: f.instrument, evidence: [f.quote] }],
    false,
  );
  if (prepared.scopeSnapshot.scope !== 'account') throw new Error('账户范围缺失');
  expect(prepared.scopeSnapshot.instruments).toEqual([]);
  expect(prepared.evidence[0]!.data).toMatchObject({
    unresolvedSymbols: [f.instrument.symbol],
    positions: [{ quantity: '2.0000001' }],
  });
  expect(prepared.evidence[0]!.reasons).toContain(
    `instrument_price_unqualified:${f.instrument.symbol}`,
  );
});
it('现金缺记录、部分或币种未知不会产生零余额或合格现金数值映射', () => {
  const f = fixture();
  expect(privateResearchEvidence(f.material, f.context.fetchedAt, []).reasons).toContain(
    'cash_balance_unrecorded',
  );
  f.material.cashBalances.push({
    accountId: f.material.accounts[0]!.accountId,
    currency: null,
    settledAmount: '100',
    pendingReceivable: '20',
    pendingPayable: '10',
    completeness: 'partial',
    issues: [],
    projectionGeneration: '3',
    asOfLedgerRevision: null,
    asOfProjectionGeneration: null,
    projectionStatus: 'unknown',
    updatedAt: f.context.fetchedAt,
  });
  const evidence = privateResearchEvidence(f.material, f.context.fetchedAt, []);
  expect(evidence.numericFields.some((field) => field.fieldPath.startsWith('/cashBalances/'))).toBe(
    false,
  );
  expect(evidence.reasons).toEqual(
    expect.arrayContaining(['cash_currency_unrecorded', 'cash_balance_incomplete']),
  );
  expect(evidence.data).toMatchObject({ cashBalances: [{ settledAmount: '100', currency: null }] });
});
it('策略材料通过现有定义合同，不能替换冻结的版本或材料种类', () => {
  const f = fixture();
  f.frozen.request.scope = { scope: 'strategy', strategyVersionId: f.strategy.strategyVersionId };
  f.frozen.scopeSnapshot = researchScopeSnapshotV2Schema.parse({
    version: 'research-scope-v2',
    scope: 'strategy',
    strategyVersionId: f.strategy.strategyVersionId,
    mode: 'shadow',
    instruments: [],
    confirmedAt: f.context.fetchedAt,
  });
  f.strategy.unresolvedSymbols = [f.instrument.symbol];
  const entry = privateResearchEvidence(f.strategy, f.context.fetchedAt, []);
  f.frozen.evidence = [entry];
  f.frozen.quality = { status: 'partial', reasons: entry.reasons };
  expect(verifyAiFrozenResearchV2(sealAiFrozenResearchV2(f.frozen)).evidence[0]!.audit.kind).toBe(
    'strategy',
  );
  const changed = structuredClone(f.frozen);
  const value = z.record(z.string(), z.json()).parse(changed.evidence[0]!.data);
  value.strategyVersionId = '00000000-0000-4000-8000-000000000022';
  changed.evidence[0]!.data = value;
  expect(aiFrozenResearchV2Schema.safeParse(changed).success).toBe(false);
});
it('仅完整且代次已核对的现金记录开放原始数值引用，陈旧记录保留未知', () => {
  const f = fixture();
  f.material.cashBalances = [
    {
      accountId: f.material.accounts[0]!.accountId,
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
      updatedAt: f.context.fetchedAt,
    },
  ];
  expect(
    privateResearchEvidence(f.material, f.context.fetchedAt, []).numericFields.filter((field) =>
      field.fieldPath.startsWith('/cashBalances/'),
    ),
  ).toHaveLength(3);
  f.material.cashBalances[0]!.projectionStatus = 'stale';
  f.material.cashBalances[0]!.asOfProjectionGeneration = '3';
  const stale = privateResearchEvidence(f.material, f.context.fetchedAt, []);
  expect(stale.numericFields.some((field) => field.fieldPath.startsWith('/cashBalances/'))).toBe(
    false,
  );
  expect(stale.reasons).toContain('cash_projection_unverified');
});
it('可引用字段超过共同上限时整体拒绝，不截断或创建模型任务', () => {
  const f = fixture();
  f.material.positions = Array.from({ length: 600 }, (_, index) => ({
    ...f.material.positions[0]!,
    symbol: `UNRESOLVED_${index}`,
  }));
  f.material.unresolvedSymbols = f.material.positions.map((position) => position.symbol);
  expect(() => privateResearchEvidence(f.material, f.context.fetchedAt, [])).toThrow(
    '可引用数值超过本次准备预算',
  );
});
