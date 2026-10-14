import { researchLotSizeDiagnostic } from './backtest-research-lot-size-diagnostic.js';
import { researchLotSourceLabel } from './backtest-research-lot-size.model.js';
import { formatDateTime } from '@/lib/date-display';

const origins = { providerCurrent: '来源默认', userOverride: '手动覆盖' } as const;
export function BacktestResearchLotSizeDisclosure({ model }: { model: unknown }) {
  const preset = researchLotSizeDiagnostic(model);
  if (!preset) return null;
  return <>
    <p>每手股数采用研究预设，未核验历史变更：本次采用{preset.sharesPerLot}股/手（{origins[preset.origin]}）；来源默认{preset.defaultSharesPerLot}股/手。</p>
    <p>每手来源：{researchLotSourceLabel(preset.source.provider)}；观察时间：{formatDateTime(preset.source.observedAt)}；重放沿用冻结值。</p>
    <p className="break-all">每手来源引用：{preset.source.sourceUrl}；来源摘要：{preset.source.sha256}</p>
  </>;
}
