import {
  benchmarkExecutionModelCostVersionV3,
  wholeShareWindowBenchmarkCostVersionV3,
  researchLotShareWindowBenchmarkCostVersionV3,
  type BacktestSnapshotManifestV3,
  type ExecutionPriceProtocol,
} from '@thesis-ledger/schemas';
import { shareWindowMarketV3 } from './backtest-share-window-source-v3.js';

type Source = BacktestSnapshotManifestV3['actualSources'][number];
/** 只由新精确来源生成整股基准版本，旧原价快照保持原基准分类。 */
export function shareWindowBenchmarkCostVersionV3(protocol: ExecutionPriceProtocol, source: Source) {
  const market = shareWindowMarketV3(protocol, source);
  if (market === 'US') return wholeShareWindowBenchmarkCostVersionV3;
  if (market === 'HK') return researchLotShareWindowBenchmarkCostVersionV3;
  return benchmarkExecutionModelCostVersionV3;
}

export function supportsWholeShareWindowBenchmarkV3(
  protocol: ExecutionPriceProtocol,
  manifest?: BacktestSnapshotManifestV3,
) {
  if (manifest?.benchmarkCostVersion !== wholeShareWindowBenchmarkCostVersionV3 &&
    manifest?.benchmarkCostVersion !== researchLotShareWindowBenchmarkCostVersionV3) return false;
  const sources = manifest.actualSources.filter(source => source.purpose === 'execution');
  return sources.length === 1 &&
    shareWindowBenchmarkCostVersionV3(protocol, sources[0]!) === manifest.benchmarkCostVersion;
}
