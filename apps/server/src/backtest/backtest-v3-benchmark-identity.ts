import type {
  BacktestBenchmarkCompatibilityIdentity,
  BacktestBenchmarkCostAssumption,
  BacktestBenchmarkCompatibilityFact,
} from '@thesis-ledger/domain';
import type { BacktestSnapshotManifestV3, RunConfigV3 } from '@thesis-ledger/schemas';

/** 基准身份只消费已验证的冻结来源，旧协议保持原规范内容。 */
export const benchmarkSourceIdentityV3 = (
  source: BacktestSnapshotManifestV3['actualSources'][number],
) => ({
  symbol: source.symbol,
  routeKey: source.routeKey,
  provenance: source.provenance,
  inputFingerprint: source.inputFingerprint,
});
export function benchmarkCompatibilityIdentityV3(
  runConfig: RunConfigV3,
  source: BacktestSnapshotManifestV3['actualSources'][number],
  costAssumption: BacktestBenchmarkCostAssumption | undefined,
  benchmarkConvention: string,
): BacktestBenchmarkCompatibilityIdentity {
  return {
    priceProtocol: {
      priceBasis: JSON.parse(
        JSON.stringify(runConfig.executionPriceProtocol.priceBasis),
      ) as BacktestBenchmarkCompatibilityFact,
      accountingBasis: runConfig.executionPriceProtocol.accountingBasis,
      timeframe: '1d',
    },
    returnProtocol: {
      version: 'v3-total-return-v1',
      metric: 'net-total-return',
      currency: runConfig.baseCurrency,
      evaluationRange: { startDate: runConfig.startDate, endDate: runConfig.endDate },
      benchmarkConvention,
    },
    historyProtocol: runConfig.executionPriceProtocol.history,
    ...(costAssumption === undefined ? {} : { costAssumption }),
    source: benchmarkSourceIdentityV3(source),
    dividendAssumption: {
      accountingBasis: runConfig.executionPriceProtocol.accountingBasis,
      meaning: runConfig.executionPriceProtocol.priceBasis.dividendMeaning,
      evidenceRef: runConfig.executionPriceProtocol.priceBasis.dividendEvidenceRef,
      ...(runConfig.executionPriceProtocol.cashEventResearch
        ? { cashEventResearch: runConfig.executionPriceProtocol.cashEventResearch }
        : {}),
      ...(runConfig.executionPriceProtocol.marketRuleResearch
        ? { marketRuleResearch: runConfig.executionPriceProtocol.marketRuleResearch }
        : {}),
    },
  };
}
