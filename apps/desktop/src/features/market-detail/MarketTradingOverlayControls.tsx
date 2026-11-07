import { formatMarketNumber, formatPercentValue } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { useMarketTradingOverlays } from './useMarketTradingOverlays.js';

type Overlay = ReturnType<typeof useMarketTradingOverlays>;

export function MarketTradingOverlayControls({ overlay }: { overlay: Overlay }) {
  const { state, update } = overlay;
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="交易叠加与测量">
        <Button
          type="button"
          size="sm"
          variant={state.trades ? 'secondary' : 'outline'}
          aria-pressed={state.trades}
          disabled={!overlay.canReadTrades}
          title={
            overlay.canReadTrades
              ? '显示当前账户和模式的账本成交'
              : '成交叠加需要明确账户、模式及不复权行情'
          }
          onClick={() => update({ trades: !state.trades })}
        >
          成交
        </Button>
        <Button
          type="button"
          size="sm"
          variant={state.cost ? 'secondary' : 'outline'}
          aria-pressed={state.cost}
          disabled={!overlay.canCost}
          title={
            overlay.canCost ? '显示当前持仓成本参考' : '成本参考需要不复权行情、持仓成本及一致币种'
          }
          onClick={() => update({ cost: !state.cost })}
        >
          成本参考
        </Button>
        <Input
          type="number"
          inputMode="decimal"
          min="0"
          max="100"
          step="any"
          value={state.risk}
          disabled={!overlay.canCost}
          aria-label="手动止损百分比"
          aria-invalid={overlay.riskInvalid}
          placeholder="止损参考 %"
          className="h-8 w-32"
          onChange={(event) => update({ risk: event.target.value })}
        />
        <Button
          type="button"
          size="sm"
          variant={state.measuring ? 'secondary' : 'outline'}
          aria-pressed={state.measuring}
          onClick={() => update({ measuring: !state.measuring, from: null, to: null })}
        >
          区间测量
        </Button>
        {state.from || state.risk ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => update({ measuring: false, from: null, to: null, risk: '' })}
          >
            清除参考
          </Button>
        ) : null}
      </div>
      {!overlay.comparable ? (
        <p className="text-xs text-muted-foreground">
          成交与成本参考需使用同币种的不复权行情；当前仍可测量价格区间。
        </p>
      ) : null}
      {overlay.riskInvalid ? (
        <p className="text-xs text-destructive">止损百分比须大于0且小于100。</p>
      ) : null}
      {overlay.notice ? (
        <p className="text-xs text-muted-foreground" role="status">
          {overlay.notice}
        </p>
      ) : null}
      {state.measuring ? (
        <p className="text-xs text-muted-foreground" role="status">
          {state.from ? '请选择区间终点；Esc可取消。' : '请选择区间起点，再选择终点。'}
        </p>
      ) : null}
      {overlay.measurement ? (
        <p className="text-sm" aria-label="价格区间测量结果">
          价格区间：{formatMarketNumber(overlay.measurement.fromPrice, 'measurement')} →{' '}
          {formatMarketNumber(overlay.measurement.toPrice, 'measurement')}， 差值
          {formatMarketNumber(overlay.measurement.difference, 'measurement')}， 涨跌幅
          {formatPercentValue(overlay.measurement.percent, 'auto', 6)}
          ，{overlay.measurement.bars}根；不含费用。
        </p>
      ) : null}
    </div>
  );
}
