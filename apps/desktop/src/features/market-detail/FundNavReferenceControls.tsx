import { formatMarketNumber, formatPercentValue } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import type { FundNavReferences } from './useFundNavReferences.js';
import { InfoTip } from '@/components/ui/info-tip';

export function FundNavReferenceControls({ references, onMeasure }: {
  references: FundNavReferences;
  onMeasure: () => void;
}) {
  const { state, cost, measurement } = references;
  return <div className="grid gap-2">
    <details className="text-sm">
      <summary className="w-fit cursor-pointer text-muted-foreground">参考与测量</summary>
      <div className="mt-2 grid gap-2">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="净值参考与测量">
          <Button type="button" size="sm" variant={references.costPrice === undefined ? 'outline' : 'secondary'}
            disabled={cost.price === undefined} aria-pressed={references.costPrice !== undefined}
            title={cost.reason ?? '显示当前持仓单位成本'} onClick={references.toggleCost}>成本参考</Button>
          {cost.reason && <InfoTip label="成本参考说明">{cost.reason}</InfoTip>}
          <Button type="button" size="sm" variant={references.measurementActive ? 'secondary' : 'outline'}
            disabled={!references.canMeasure && !references.measurementActive} aria-pressed={references.measurementActive} onClick={onMeasure}>区间测量</Button>
        </div>
      </div>
    </details>
    {state.measuring && state.notice && <p className="m-0 text-xs text-muted-foreground" role="status">{state.notice}</p>}
    {state.measuring && <p className="m-0 text-xs text-muted-foreground" role="status">
      {state.from ? '请选择净值区间终点；Esc 可取消。' : '请选择净值区间起点，再选择终点。'}
    </p>}
    {measurement && <p className="m-0 text-sm" aria-label="净值区间测量结果">
      {measurement.from} 至 {measurement.to}，净值 {formatMarketNumber(measurement.fromPrice, 'measurement')} → {formatMarketNumber(measurement.toPrice, 'measurement')}，
      差值 {formatMarketNumber(measurement.difference, 'measurement')}，涨跌幅 {formatPercentValue(measurement.percent, 'always', 6)}，
      共 {measurement.count} 条净值记录；不含费用。
      {measurement.percent === null && '起点净值为零，无法计算涨跌幅。'}
    </p>}
    {state.from && state.to && !measurement && <p className="m-0 text-xs text-muted-foreground" role="status">测量日期缺少净值记录，请重新选择区间。</p>}
  </div>;
}
