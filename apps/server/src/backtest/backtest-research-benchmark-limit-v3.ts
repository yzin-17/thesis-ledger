import type { BacktestBenchmarkCostAssumption } from '@thesis-ledger/domain';
import type { ExecutionPriceProtocol, BacktestSnapshotManifestV3 } from '@thesis-ledger/schemas';
import { hashCanonicalManifest } from './backtest-snapshot.js';
import { supportsWholeShareWindowBenchmarkV3 } from './backtest-share-window-benchmark-profile-v3.js';
export { supportsWholeShareWindowBenchmarkV3 } from './backtest-share-window-benchmark-profile-v3.js';

/** 未交付实际数量基准的研究协议，各自冻结不可比较的原因和身份。 */
export function researchBenchmarkLimitV3(
  protocol: ExecutionPriceProtocol,
  manifest?: BacktestSnapshotManifestV3,
): { reason: string; cost: BacktestBenchmarkCostAssumption } | undefined {
  if (supportsWholeShareWindowBenchmarkV3(protocol, manifest)) return undefined;
  let reason: string;
  let version: string;
  let profile: string;
  if (protocol.cashEventResearch) {
    reason = '现金分红研究尚未纳入基准现金与实际数量模型，基准净收益和超额收益不可用';
    version = 'v3-cash-event-benchmark-unavailable-v1';
    profile = protocol.cashEventResearch;
  } else if (protocol.marketRuleResearch) {
    reason = '规则研究尚未纳入基准实际数量与状态模型，基准净收益和超额收益不可用';
    version = 'v3-market-rule-benchmark-unavailable-v1';
    profile = protocol.marketRuleResearch;
  } else return undefined;
  return {
    reason,
    cost: { kind: 'unsupported', version, fingerprint: hashCanonicalManifest({ reason, profile }) },
  };
}
