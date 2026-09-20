import type { MarketChartBar, MarketChartIndicator } from './market-chart-types.js';

type IndicatorPoint = MarketChartIndicator['points'][number];

export type ChartPoint = {
  date: string;
  bar?: MarketChartBar;
  indicators: Partial<Record<'MA' | 'MACD' | 'RSI', IndicatorPoint>>;
  comparableIndicators: Partial<Record<'MA' | 'MACD' | 'RSI', boolean>>;
  comparable: boolean;
};

const day = (timestamp: string) => timestamp.slice(0, 10);

const sameInput = (bar: MarketChartBar | undefined, point: IndicatorPoint | undefined) => {
  if (!bar?.inputFingerprint || !point?.inputFingerprint) return false;
  return bar.inputFingerprint === point.inputFingerprint;
};

const provenanceCoversDate = (indicator: MarketChartIndicator, date: string) => {
  const range = indicator.inputProvenance?.inputDateRange;
  if (!range) return true;
  return range.start.slice(0, 10) <= date && date <= range.end.slice(0, 10);
};

export const buildChartPoints = (bars: MarketChartBar[], indicators: MarketChartIndicator[]): ChartPoint[] => {
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
        .filter((candidate): candidate is { indicator: MarketChartIndicator; point: IndicatorPoint } =>
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

/**
 * 历史分页的每一页都是独立的窗口与 inputFingerprint，因此 ChartPoint 必须先按页
 * 构建再按日期合并。直接对合并后的 BarSeries 逐日比对 fingerprint 会让先前已加载
 * 的日期失去可比性（均线/MACD 被置空）。
 */
const mergeChartPointEvidence = (left: ChartPoint, right: ChartPoint): ChartPoint => {
  const indicators = { ...left.indicators };
  const comparableIndicators = { ...left.comparableIndicators };
  const bar = left.bar ?? right.bar;
  (Object.keys(right.indicators) as Array<keyof ChartPoint['indicators']>).forEach((name) => {
    const next = right.indicators[name];
    if (!next) return;
    // 如果左侧页面提供了同日更新后的 bar，右侧旧页的指标即使自身可比，也不能
    // 越过 fingerprint 校验重新挂到新 bar 上。
    const rightComparable =
      right.comparableIndicators[name] === true && (!bar || sameInput(bar, next));
    if (!indicators[name] || (rightComparable && comparableIndicators[name] !== true)) {
      indicators[name] = next;
      comparableIndicators[name] = rightComparable;
    }
  });
  return {
    date: left.date,
    ...(bar ? { bar } : {}),
    indicators,
    comparableIndicators,
    comparable: Object.values(comparableIndicators).every(Boolean),
  };
};

export const mergeChartPoints = (groups: readonly ChartPoint[][]): ChartPoint[] => {
  const byDate = new Map<string, ChartPoint>();
  groups.forEach((points) => {
    points.forEach((point) => {
      const existing = byDate.get(point.date);
      byDate.set(point.date, existing ? mergeChartPointEvidence(existing, point) : point);
    });
  });
  return [...byDate.values()].sort((left, right) => left.date.localeCompare(right.date));
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
