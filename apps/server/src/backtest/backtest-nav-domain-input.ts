import type {
  CnNavFact,
  CnNavSimulationConfig,
  FrozenNavExecutionModelSegment,
} from '@thesis-ledger/domain';
import {
  compareMarketPitEvidenceInstantStringsV1,
  type BacktestNavSnapshotManifestV3,
} from '@thesis-ledger/schemas';
import {
  navIntegrityFailure,
  validateNavFrozenInputs,
  type NavFrozenContext,
} from './backtest-nav-freeze-validation.js';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { planNavSnapshotInputsV3 } from './backtest-nav-input-plan.js';
import { navDomainCalendar } from './backtest-nav-domain-calendar.js';

const notAfter = (left: string, right: string) => {
  const compared = compareMarketPitEvidenceInstantStringsV1(left, right);
  return compared !== undefined && compared <= 0;
};

/** 只消费现行冻结读回结果；事件编排由 N3 拥有。 */
export const adaptNavDomainInputsV3 = (input: {
  manifest: BacktestNavSnapshotManifestV3;
  context: NavFrozenContext;
}) => {
  const { manifest: value, context } = structuredClone(input);
  const manifest = validateNavFrozenInputs(value, context);
  if (manifest.contentHash !== hashCanonicalManifest(manifest)) {
    navIntegrityFailure('NAV Domain 输入 Manifest 摘要不符');
  }
  const { runConfig } = context;
  const executionInstrument = {
    symbol: manifest.navInput.symbol,
    market: 'CN' as const,
    assetType: 'fund' as const,
    currency: 'CNY' as const,
  };
  const firstSegment = runConfig.executionModel.segments[0];
  if (!firstSegment || firstSegment.execution.mode !== 'nav') {
    navIntegrityFailure('NAV Domain 输入缺少净值执行分段');
  }
  const segments = runConfig.executionModel.segments.map(
    (segment): FrozenNavExecutionModelSegment => {
      if (segment.execution.mode !== 'nav' || segment.fees !== null) {
        navIntegrityFailure('NAV Domain 输入包含场内执行分段');
      }
      return { ...segment, fees: null, execution: segment.execution };
    },
  );
  const config: CnNavSimulationConfig = {
    executionInstrument,
    ledgerConfig: {
      executionInstrument: { ...executionInstrument },
      baseCurrency: runConfig.baseCurrency,
      initialCash: Object.fromEntries(
        Object.entries(runConfig.initialCash).filter(([, amount]) => amount !== undefined),
      ),
    },
    calendar: navDomainCalendar(context.calendar),
    calendarVersion: context.calendar.version,
    cutoffLocalTime: firstSegment.execution.cutoffLocalTime,
    timeframe: '1d',
    executionModel: { ...runConfig.executionModel, segments },
    dataAsOf: runConfig.dataAsOf,
  };
  const facts: CnNavFact[] = manifest.facts.map((fact) => ({
    symbol: fact.symbol,
    market: 'CN',
    instrumentType: 'NAV_FUND',
    nav: fact.nav,
    valuationDate: fact.valuationDate,
    occurredAt: fact.occurredAt,
    availableAt: fact.availableAt,
    provider: manifest.source.target.providerId,
    providerRevision: manifest.source.providerRevision,
    freshness: fact.freshness,
    quality: fact.quality,
    status: fact.status,
  }));
  const byDate = new Map(facts.map((fact) => [fact.valuationDate, structuredClone(fact)]));
  const dataAsOf = runConfig.dataAsOf;
  return {
    config,
    facts,
    navVisibility: structuredClone(runConfig.navVisibility),
    visibilityDisclosure:
      manifest.navVisibility.mode === 'research-assumption'
        ? {
            classification: 'research-assumption' as const,
            strictPit: false as const,
            assumptions: [
              '净值按冻结规则的披露工作日延迟及日终边界可见；延期披露与历史修订未获证明',
            ],
          }
        : {
            classification: 'strict-publication' as const,
            requiresSourcePitAdmission: true as const,
            assumptions: [],
          },
    plan: planNavSnapshotInputsV3(context),
    pricingFactAt: (valuationDate: string, evaluationAt: string): CnNavFact | undefined => {
      const fact = byDate.get(valuationDate);
      if (
        !fact ||
        !notAfter(evaluationAt, dataAsOf) ||
        !notAfter(fact.occurredAt, evaluationAt) ||
        !notAfter(fact.availableAt, evaluationAt)
      ) {
        return undefined;
      }
      return structuredClone(fact);
    },
  };
};
