import { expect, it } from 'vitest';
import { backtestMetricDisplay, backtestStageDisplay, isBacktestRunUpdateOlder, backtestRuleDiagnosticDisplay } from '../src/backtest-result-presentation.js';

it('成交金额附币种，双边周转率为比例，旧金额永不解释成比例', () => {
  const metric = { status: 'available', value: '1.5' };
  expect(backtestMetricDisplay('turnoverRate', metric, 'CNY').value).toContain('150');
  expect(backtestMetricDisplay('turnoverRate', metric, 'CNY').value).toContain('%');
  expect(backtestMetricDisplay('tradedNotional', { ...metric, value: '1500.000001' }, 'HKD')).toMatchObject({ value: '1500.000001 HKD' });
  expect(backtestMetricDisplay('turnover', metric, 'CNY')).toMatchObject({ label: '成交额（旧口径）', value: '1.5 CNY' });
  expect(backtestMetricDisplay('turnoverRate', undefined, 'CNY').available).toBe(false);
});
it('夏普未定义单独说明，零收益与零交易仍可显示', () => {
  expect(backtestMetricDisplay('sharpe', { status: 'unavailable', reason: 'ZERO_VOLATILITY' }, 'CNY').value).toContain('零');
  expect(backtestMetricDisplay('totalReturn', { status: 'available', value: '0' }, 'CNY').available).toBe(true);
  expect(backtestMetricDisplay('tradeCount', { status: 'available', value: '0' }, 'CNY').value).toBe('0');
});
it('取消登记、终态及attempt不会被同Run晚到响应覆盖，手动新attempt可推进', () => {
  const base = { id: 'run', status: 'running', executionAttempt: 1, updatedAt: '2026-11-20T01:00:00Z' };
  expect(isBacktestRunUpdateOlder({ ...base, cancelRequestedAt: 'now' }, base)).toBe(true);
  expect(isBacktestRunUpdateOlder({ ...base, status: 'cancelled' }, base)).toBe(true);
  expect(isBacktestRunUpdateOlder({ ...base, status: 'failed' }, { ...base, executionAttempt: 2 })).toBe(false);
  expect(isBacktestRunUpdateOlder({ ...base, executionAttempt: 2 }, base)).toBe(true);
  expect(isBacktestRunUpdateOlder(base, { ...base, updatedAt: '2026-11-20T00:00:00Z' })).toBe(true);
  expect(isBacktestRunUpdateOlder(base, { ...base, id: 'linked' })).toBe(false);
});
it('四阶段有具体业务名称，条件恒假不伪装成不可计算', () => {
  for (const stage of ['preparing', 'freezing', 'simulating', 'analyzing']) expect(backtestStageDisplay(stage)).not.toBe('其他阶段');
  const display = backtestRuleDiagnosticDisplay({ version: 'rule-evaluation-v1', rules: [{ ruleId: 'entry', path: ['entry'],
    observations: 10, computableObservations: 10, trueObservations: 0, applicableDecisions: 10,
    computableDecisions: 10, warmupObservations: 0, unavailableReasons: [] }] });
  expect(display[0]?.summary).toContain('条件未成立10次');
  expect(display[0]?.summary).toContain('不可计算0次');
});
