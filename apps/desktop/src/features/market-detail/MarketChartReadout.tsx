import { Fragment } from 'react';
import type { MarketChartBar } from './market-chart-types.js';
import { Separator } from '@/components/ui/separator';
import { indicatorComparable, indicatorValue, type ChartPoint } from './market-chart-model.js';
import type { ChartPreference } from './market-chart-preferences.js';

const number = new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 4 });

type ReadoutValue = {
  label: string;
  value: number | null;
  color?: string;
};

const finiteReadoutValue = (label: string, value: number | null, color?: string) => {
  const normalized = typeof value === 'number' && Number.isFinite(value) ? value : null;
  return { label, value: normalized, ...(color ? { color } : {}) } satisfies ReadoutValue;
};

const priceReadoutValues = (bar: MarketChartBar | undefined) => [
  finiteReadoutValue('开', bar?.open ?? null),
  finiteReadoutValue('高', bar?.high ?? null),
  finiteReadoutValue('低', bar?.low ?? null),
  finiteReadoutValue('收', bar?.close ?? null, 'var(--chart-1)'),
  finiteReadoutValue('量', bar?.volume ?? null),
];

const maReadoutValues = (
  point: ChartPoint | undefined,
  visibleMA: ChartPreference['visibleMA'],
) => {
  const colors = ['var(--chart-1)', 'var(--chart-4)', 'var(--chart-2)', 'var(--chart-3)'];
  return visibleMA
    .map((name, index) => {
      const value = point && indicatorComparable(point, 'MA')
        ? indicatorValue(point.indicators.MA, [name])
        : null;
      return finiteReadoutValue(name.toUpperCase(), value, colors[index]);
    });
};

const macdReadoutValues = (point: ChartPoint | undefined) => {
  const comparable = point && indicatorComparable(point, 'MACD');
  return [
    finiteReadoutValue('DIF', comparable ? indicatorValue(point.indicators.MACD, ['dif']) : null, 'var(--chart-1)'),
    finiteReadoutValue('DEA', comparable ? indicatorValue(point.indicators.MACD, ['dea']) : null, 'var(--chart-4)'),
    finiteReadoutValue(
      '柱',
      comparable ? indicatorValue(point.indicators.MACD, ['histogram', 'hist', 'macdbar']) : null,
      'var(--chart-5)',
    ),
  ];
};

const rsiReadoutValues = (point: ChartPoint | undefined, rsiPeriod: ChartPreference['rsiPeriod']) => {
  const comparable = point && indicatorComparable(point, 'RSI');
  return [
    finiteReadoutValue(
      `RSI${rsiPeriod}`,
      comparable ? indicatorValue(point.indicators.RSI, [`rsi${rsiPeriod}`, 'rsi']) : null,
      'var(--chart-1)',
    ),
  ];
};

function ReadoutGroup({ title, values }: { title: string; values: ReadoutValue[] }) {
  return (
    <section
      className="flex min-h-14 min-w-36 flex-none flex-col gap-1"
      data-market-chart-readout-group={title}
    >
      <h5 className="m-0 text-xs font-medium text-muted-foreground">{title}</h5>
      <dl className="m-0 grid grid-flow-col auto-cols-max gap-3 whitespace-nowrap text-xs tabular-nums">
        {values.map((item) => (
          <div key={item.label} className="flex min-h-4 items-center gap-1" data-market-chart-readout-slot={item.label}>
            {item.color ? (
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
            ) : null}
            <dt className="text-muted-foreground">{item.label}</dt>
            <dd className="m-0">{item.value === null ? '—' : number.format(item.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function MarketChartReadout({
  selectedBar,
  selectedPoint,
  selectedTimestamp,
  lockedTimestamp,
  visibleIndicators,
  visibleMA,
  rsiPeriod,
  activePane,
  showBothPanes,
}: {
  selectedBar: MarketChartBar | undefined;
  selectedPoint: ChartPoint | undefined;
  selectedTimestamp: string | null;
  lockedTimestamp: string | null;
  visibleIndicators: ChartPreference['visibleIndicators'];
  visibleMA: ChartPreference['visibleMA'];
  rsiPeriod: ChartPreference['rsiPeriod'];
  activePane: ChartPreference['activePane'];
  showBothPanes: boolean;
}) {
  const date = selectedBar?.timestamp.slice(0, 10);
  let interaction = '最新日';
  if (lockedTimestamp) {
    interaction = '已锁定';
  } else if (selectedTimestamp) {
    interaction = '悬停查看';
  }
  const rendersAuxiliaryPane = (name: 'MACD' | 'RSI') =>
    visibleIndicators.includes(name) && (showBothPanes || activePane === name);
  const groups = [
    { title: '价格', values: priceReadoutValues(selectedBar) },
    ...(visibleIndicators.includes('MA') && visibleMA.length > 0
      ? [{ title: '均线', values: maReadoutValues(selectedPoint, visibleMA) }]
      : []),
    ...(rendersAuxiliaryPane('MACD')
      ? [{ title: 'MACD', values: macdReadoutValues(selectedPoint) }]
      : []),
    ...(rendersAuxiliaryPane('RSI')
      ? [{ title: 'RSI', values: rsiReadoutValues(selectedPoint, rsiPeriod) }]
      : []),
  ];

  return (
    <div className="flex flex-col gap-2" data-market-chart-readout>
      <p className="m-0 text-xs text-muted-foreground" role="status" aria-live="polite">
        {date ? `${interaction} ${new Date(date).toLocaleDateString('zh-CN')}` : '悬停查看，点击锁定，Esc 恢复最新'}
      </p>
      <div className="overflow-x-auto">
        <div className="flex min-w-max items-stretch gap-3">
          {groups.map((group, index) => (
            <Fragment key={group.title}>
              {index > 0 ? <Separator orientation="vertical" className="hidden sm:block" /> : null}
              <ReadoutGroup {...group} />
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
