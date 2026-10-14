import { compareMarketPitEvidenceInstantStringsV1, type BacktestSnapshotManifestV3, type RunConfigV3 } from '@thesis-ledger/schemas';
import type { ArtifactRow } from './backtest-artifact-store.js';
import { shareWindowMarketV3 } from './backtest-share-window-source-v3.js';

export function hkResearchLotForSourceV3(source: BacktestSnapshotManifestV3['actualSources'][number], config: RunConfigV3) {
  const preset = config.executionModel?.researchLotSize;
  const qualified = shareWindowMarketV3(config.executionPriceProtocol, source) === 'HK';
  if (qualified && !preset) throw new Error('港股按股研究需要明确每手股数预设');
  if (!qualified && preset) throw new Error('每手研究预设未绑定已核对的港股原价来源');
  return preset;
}

/** 独立参考按标的绑定，旧参考仍沿用原默认值检查；只建立模拟成交坐标。 */
export function hkResearchLotForFactV3(row: ArtifactRow, config: RunConfigV3) {
  const preset = config.executionModel?.researchLotSize;
  const hkSource = row.provider === 'yahoo-hk-share-window';
  if (!hkSource && !preset) return undefined;
  if (!hkSource || !preset || row.symbol !== '00147.HK' || row.market !== 'HK' ||
    row.instrumentType !== 'STOCK' || row.currency !== 'HKD' || row.tickSize !== '0.001' ||
    (preset.source.symbol ? preset.source.symbol !== row.symbol : row.lotSize !== preset.defaultSharesPerLot) ||
    config.executionModel?.scope.symbol !== row.symbol ||
    config.executionPriceProtocol.accountingBasis !== 'raw-events' ||
    config.executionPriceProtocol.marketRuleResearch !== 'raw-prices-no-corporate-actions-v1' ||
    config.executionPriceProtocol.priceBasis.quantityBasis !== 'actual-units' ||
    config.executionPriceProtocol.history.basis !== 'fixed-provider-snapshot')
    throw new Error('港股按股窗口缺少匹配的每手研究预设或原价单位绑定');
  const clock = compareMarketPitEvidenceInstantStringsV1(preset.source.observedAt, config.dataAsOf);
  if (clock !== -1 && clock !== 0) throw new Error('每手研究预设来源晚于研究冻结截点');
  return preset;
}
