import { useState } from 'react';
import { marketDetailRequestSchema } from '@thesis-ledger/schemas';
import {
  Action,
  Choices,
  Copy,
  Feedback,
  Field,
  Section,
  failureMessage,
} from '../../components/MobilePrimitives';
import {
  marketAdjustments,
  marketTimeframes,
  marketChartRequest,
  type MarketChartFilters,
} from './market-model';
export const initialMarketFilters: MarketChartFilters = {
  timeframe: '1d',
  adjustment: 'qfq',
  barsLimit: 90,
  end: '',
  ma: true,
  macd: false,
  rsi: false,
  maPeriod: '5',
  rsiPeriod: '12',
  macdFast: '12',
  macdSlow: '26',
  macdSignal: '9',
};
export function MarketChartControls({
  symbol,
  filters,
  onApply,
}: {
  symbol: string;
  filters: MarketChartFilters;
  onApply: (value: MarketChartFilters) => void;
}) {
  const [draft, setDraft] = useState(filters);
  const [bars, setBars] = useState(String(filters.barsLimit));
  const [error, setError] = useState<string | null>(null);
  const change = (patch: Partial<MarketChartFilters>) =>
    setDraft((value) => ({ ...value, ...patch }));
  return (
    <Section title="周期与指标">
      <Choices
        label="行情周期"
        value={draft.timeframe}
        options={marketTimeframes}
        onChange={(timeframe) =>
          change({ timeframe, adjustment: timeframe === '1m' ? 'none' : draft.adjustment })
        }
      />
      <Choices
        label="价格口径"
        value={draft.adjustment}
        options={marketAdjustments}
        onChange={(adjustment) => change({ adjustment })}
      />
      <Field label="图表根数" value={bars} onChange={setBars} keyboardType="number-pad" />
      <Field
        label="图表截止日期（可选 YYYY-MM-DD）"
        value={draft.end}
        onChange={(end) => change({ end })}
      />
      <Choices
        label="均线指标"
        value={draft.ma ? 'on' : 'off'}
        options={[
          { value: 'on', label: '显示均线' },
          { value: 'off', label: '隐藏均线' },
        ]}
        onChange={(value) => change({ ma: value === 'on' })}
      />
      {draft.ma ? (
        <Field
          label="均线周期"
          value={draft.maPeriod}
          onChange={(maPeriod) => change({ maPeriod })}
          keyboardType="number-pad"
        />
      ) : null}
      <Choices
        label="MACD 指标"
        value={draft.macd ? 'on' : 'off'}
        options={[
          { value: 'on', label: '显示 MACD' },
          { value: 'off', label: '隐藏 MACD' },
        ]}
        onChange={(value) => change({ macd: value === 'on' })}
      />
      {draft.macd ? (
        <>
          <Field
            label="MACD 快周期"
            value={draft.macdFast}
            onChange={(macdFast) => change({ macdFast })}
            keyboardType="number-pad"
          />
          <Field
            label="MACD 慢周期"
            value={draft.macdSlow}
            onChange={(macdSlow) => change({ macdSlow })}
            keyboardType="number-pad"
          />
          <Field
            label="MACD 信号周期"
            value={draft.macdSignal}
            onChange={(macdSignal) => change({ macdSignal })}
            keyboardType="number-pad"
          />
        </>
      ) : null}
      <Choices
        label="RSI 指标"
        value={draft.rsi ? 'on' : 'off'}
        options={[
          { value: 'on', label: '显示 RSI' },
          { value: 'off', label: '隐藏 RSI' },
        ]}
        onChange={(value) => change({ rsi: value === 'on' })}
      />
      {draft.rsi ? (
        <Field
          label="RSI 中周期（短 6／长 24）"
          value={draft.rsiPeriod}
          onChange={(rsiPeriod) => change({ rsiPeriod })}
          keyboardType="number-pad"
        />
      ) : null}
      <Copy muted>选择后应用到图表；每种周期和口径均由当前来源确认，不可用时保留原因。</Copy>
      <Feedback message={error} error />
      <Action
        label="应用行情设置"
        onPress={() => {
          try {
            const next = { ...draft, barsLimit: Number(bars) };
            marketDetailRequestSchema.parse(marketChartRequest(symbol, next));
            onApply(next);
            setError(null);
          } catch (caught) {
            setError(failureMessage(caught));
          }
        }}
      />
    </Section>
  );
}
