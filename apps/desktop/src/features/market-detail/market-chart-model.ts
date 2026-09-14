import type { BarV1, IndicatorV1 } from '@thesis-ledger/schemas';

type IndicatorPoint = NonNullable<IndicatorV1['points']>[number];

export type ChartPoint = {
  date: string;
  bar?: BarV1;
  indicators: Partial<Record<'MA' | 'MACD' | 'RSI', IndicatorPoint>>;
  comparableIndicators: Partial<Record<'MA' | 'MACD' | 'RSI', boolean>>;
  comparable: boolean;
};

const day = (timestamp: string) => timestamp.slice(0, 10);

const sameInput = (bar: BarV1 | undefined, point: IndicatorPoint | undefined) => {
  if (!bar?.inputFingerprint || !point?.inputFingerprint) return false;
  return bar.inputFingerprint === point.inputFingerprint;
};

const provenanceCoversDate = (indicator: IndicatorV1, date: string) => {
  const range = indicator.inputProvenance?.inputDateRange;
  if (!range) return true;
  return range.start.slice(0, 10) <= date && date <= range.end.slice(0, 10);
};

export const buildChartPoints = (bars: BarV1[], indicators: IndicatorV1[]): ChartPoint[] => {
  const barByDate = new Map(bars.map((bar) => [day(bar.timestamp), bar]));
  const pointsByIndicator = indicators.map((indicator) => ({
    indicator,
    points: new Map(indicator.points?.map((point) => [day(point.timestamp), point])),
  }));
  const indicatorsByName = new Map<string, typeof pointsByIndicator>();
  pointsByIndicator.forEach((entry) => {
    const entries = indicatorsByName.get(entry.indicator.name) ?? [];
    entries.push(entry);
    indicatorsByName.set(entry.indicator.name, entries);
  });
  const dates = new Set(barByDate.keys());
  if (bars.length === 0)
    pointsByIndicator.forEach(({ points }) => points.forEach((_point, date) => dates.add(date)));
  return [...dates].sort().map((date) => {
    const bar = barByDate.get(date);
    const indicatorMap: ChartPoint['indicators'] = {};
    const comparableIndicators: ChartPoint['comparableIndicators'] = {};
    indicatorsByName.forEach((entries, rawName) => {
      const name = rawName as 'MA' | 'MACD' | 'RSI';
      const candidates = entries
        .map(({ indicator, points }) => ({ indicator, point: points.get(date) }))
        .filter((candidate): candidate is { indicator: IndicatorV1; point: IndicatorPoint } =>
          Boolean(candidate.point),
        );
      const comparable = candidates.find(({ indicator, point }) => {
        const hasEvidence = Boolean(
          indicator.inputProvenance &&
          indicator.calculationAnchor?.timestamp &&
          point.inputFingerprint,
        );
        return (
          hasEvidence &&
          indicator.symbol === bar?.symbol &&
          indicator.timeframe === bar?.timeframe &&
          indicator.provider === bar?.provider &&
          (!bar?.providerRevision ||
            !indicator.inputProvenance?.providerRevision ||
            bar.providerRevision === indicator.inputProvenance.providerRevision) &&
          (!bar?.adjustment || bar.adjustment === indicator.inputProvenance?.adjustment) &&
          provenanceCoversDate(indicator, date) &&
          sameInput(bar, point)
        );
      });
      const selected = comparable ?? candidates[0];
      if (selected) {
        indicatorMap[name] = selected.point;
        comparableIndicators[name] = selected === comparable;
      }
    });
    const comparable = Object.values(comparableIndicators).every(Boolean);
    return {
      date,
      ...(bar ? { bar } : {}),
      indicators: indicatorMap,
      comparableIndicators,
      comparable,
    };
  });
};

export const indicatorComparable = (point: ChartPoint, name: string) =>
  point.comparableIndicators[name as 'MA' | 'MACD' | 'RSI'] === true;

export const indicatorValue = (
  point: ChartPoint['indicators'][keyof ChartPoint['indicators']],
  names: string[],
) => {
  if (!point) return null;
  for (const name of names) {
    const value = point.values[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return null;
};

export const chartDate = (timestamp: string) => day(timestamp);
