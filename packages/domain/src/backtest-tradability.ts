export interface BacktestTradabilityDay {
  date: string;
  state: 'observed-traded' | 'observed-price-only' | 'assumed-untradable-no-bar';
}

/** 日级状态只约束实际 Bar；不可交易日不产生替代价格或执行时钟。 */
export const assertBacktestTradabilityBars = (input: {
  days: readonly BacktestTradabilityDay[];
  barDates: readonly string[];
  range: { startDate: string; endDate: string };
  allowPriceOnly?: boolean;
}): string[] => {
  const states = new Map<string, BacktestTradabilityDay['state']>();
  for (const day of input.days) {
    if (day.state === 'observed-price-only' && !input.allowPriceOnly)
      throw new Error('价格观察不能授予真实份额执行资格');
    const previous = states.get(day.date);
    if (previous !== undefined && previous !== day.state) throw new Error('日级可交易性状态冲突');
    states.set(day.date, day.state);
  }
  const observed = [...states]
    .filter(([, state]) => state === 'observed-traded' || (input.allowPriceOnly && state === 'observed-price-only'))
    .map(([date]) => date)
    .sort();
  if (JSON.stringify(observed) !== JSON.stringify(input.barDates)) {
    throw new Error('执行 Bar 必须与冻结的已交易日期严格一致');
  }
  return [...states]
    .filter(
      ([date, state]) =>
        state === 'assumed-untradable-no-bar' &&
        date >= input.range.startDate &&
        date <= input.range.endDate,
    )
    .map(([date]) => date)
    .sort();
};
