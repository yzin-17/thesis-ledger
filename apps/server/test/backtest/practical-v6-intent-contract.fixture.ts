import type { BooleanExpression as B, NumericExpression as N } from '@thesis-ledger/domain';
import type { BacktestStrategy } from '@thesis-ledger/schemas';

/** 参数直接来自七例明确需求；不是模型输出或生成提示的派生值。 */
export const practicalIntentDefaults = {
  countWindow: 5, minimumUp: 3, consecutive: 3, averagePeriod: 20,
  quantileWindow: 60, quantile: '0.2', gap: '0.02', highPeriod: 20,
  within: 10, confirmationMultiple: '1.02', hourlyPeriod: 5,
  anchorAt: '2026-03-02T15:00:00+08:00', deviation: '0.01', allocation: '0.2', stop: '0.05',
};
export type PracticalIntentParameters = typeof practicalIntentDefaults;
export const intentValue = (value: string): N => ({ type: 'constant', value });
export const intentSeries = (field: 'open' | 'high' | 'close' | 'volume', sourceId = 'day'): N => ({ type: 'series', sourceId, field });
const compare = (operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq', left: N, right: N): B => ({ type: 'compare', operator, left, right });
const arithmetic = (operator: 'divide' | 'subtract' | 'multiply', left: N, right: N): N => ({ type: 'arithmetic', operator, left, right });
const average = (name: 'MA' | 'EMA' | 'Highest', period: number, input: N): N => ({ type: 'indicator', name, input, params: { period } });
const all = (...conditions: B[]): B => ({ type: 'all', conditions });
export const falseIntent: B = compare('eq', intentValue('0'), intentValue('1'));

export function expectedPracticalEntry(id: string, p: PracticalIntentParameters, baseline?: BacktestStrategy): BacktestStrategy['entry'] {
  const close = intentSeries('close');
  if (id === 'count-confirmation') return all(
    compare('gte', { type: 'countTrue', periods: p.countWindow,
      condition: compare('gt', close, intentSeries('open')) }, intentValue(String(p.minimumUp))),
    { type: 'consecutive', periods: p.consecutive,
      condition: compare('gt', close, average('EMA', p.averagePeriod, close)) });
  if (id === 'statistics-gap') {
    const width = arithmetic('divide', { type: 'rolling', statistic: 'standardDeviation',
      periods: p.averagePeriod, ddof: 0, input: close }, average('MA', p.averagePeriod, close));
    return all(compare('lte', width, { type: 'rolling', statistic: 'quantile',
      periods: p.quantileWindow, quantile: p.quantile, input: width }),
    compare('lt', { type: 'absolute', input: arithmetic('subtract', arithmetic('divide',
      intentSeries('open'), { type: 'lag', periods: 1, input: close }), intentValue('1')) }, intentValue(p.gap)));
  }
  if (id === 'captured-retest') {
    const capture: N = { type: 'lag', periods: 1, input: average('Highest', p.highPeriod, intentSeries('high')) };
    return { type: 'sequence', trigger: compare('gt', close, capture), capture,
      confirm: compare('gt', close, arithmetic('multiply', { type: 'eventValue' }, intentValue(p.confirmationMultiple))),
      invalidation: compare('lt', close, { type: 'eventValue' }), within: p.within,
      allowSameBar: false, repeat: true };
  }
  if (id === 'timeframes-anchor') {
    const hour = intentSeries('close', 'hour');
    const volume: N = { type: 'cumulative', statistic: 'sum', anchorAt: p.anchorAt, input: intentSeries('volume') };
    return all(compare('gt', close, average('MA', p.averagePeriod, close)),
      compare('gt', hour, average('MA', p.hourlyPeriod, hour)),
      compare('gt', volume, { type: 'lag', periods: 1, input: volume }));
  }
  if (id === 'session-vwap-arithmetic') return compare('lt', { type: 'absolute',
    input: arithmetic('subtract', arithmetic('divide', intentSeries('close', 'minute'),
      { type: 'sessionValue', sourceId: 'minute', field: 'vwap' }), intentValue('1')) }, intentValue(p.deviation));
  if (id === 'hfq-only-discovery') return compare('gt', close, average('MA', p.averagePeriod, close));
  if (id === 'stop-only-policy' && baseline) return baseline.entry;
  throw new Error(`缺少明确的验收需求：${id}`);
}

export function practicalIntentReference(id: string, changes: Partial<PracticalIntentParameters> = {}, baseline?: BacktestStrategy): BacktestStrategy {
  const p = { ...practicalIntentDefaults, ...changes };
  const asset = { symbol: '159516.SZ', market: 'CN' as const, assetType: 'etf' as const };
  const entry = expectedPracticalEntry(id, p, baseline);
  let exit: BacktestStrategy['exit'] = falseIntent;
  if (id === 'hfq-only-discovery') exit = compare('lt', intentSeries('close'), average('MA', p.averagePeriod, intentSeries('close')));
  if (id === 'stop-only-policy' && baseline) exit = baseline.exit;
  return {
    ...(id === 'stop-only-policy' ? baseline : {}), schemaVersion: 'strategy-definition-v1', name: baseline?.name ?? '独立需求基准',
    executionInstrument: asset, primaryTimeframe: id === 'session-vwap-arithmetic' ? '1m' : '1d',
    signalSources: id === 'stop-only-policy' && baseline ? baseline.signalSources :
      (['day', 'hour', 'minute'] as const).map((id) => ({ id, asset,
        timeframe: { day: '1d' as const, hour: '60m' as const, minute: '1m' as const }[id],
        priceCoordinate: 'research' as const, series: ['close', 'open', 'high', 'volume'] })),
    entryTrigger: baseline?.entryTrigger ?? 'rising-edge', entry, exit,
    sizing: { type: 'percentOfEquity', percent: p.allocation }, risk: [],
    execution: { mode: 'exchange', timing: 'nextEligibleBarOpen', orderType: 'market', timeInForce: 'DAY' },
    cost: { commissionRate: '0.0003', slippageRate: '0.001' },
    ...(id === 'stop-only-policy' ? { tradePlan: { version: 1, evaluation: 'barClose',
      stages: [], initialStop: { kind: 'percent', percent: p.stop, activation: { kind: 'immediate' } } } } : {}),
  };
}
