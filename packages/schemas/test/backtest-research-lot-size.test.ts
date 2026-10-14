import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { backtestExecutionModelSchema, backtestExecutionModelSchemaV3, executionModelAccountingIssuesV3, executionModelRunIssues } from '../src/backtest-execution-model.js';
import { backtestResearchLotSizeSchema } from '../src/backtest-research-lot-size.js';

const preset = () => ({ sharesPerLot: '5000', defaultSharesPerLot: '5000', origin: 'providerCurrent' as const,
  historicalChanges: 'unverified' as const, source: { provider: 'webull-current-quote',
    sourceUrl: 'https://www.webull.hk/quote/hkg-00147', sha256: 'a'.repeat(64), observedAt: '2026-10-08T08:57:12.937458Z' } });
const model = () => {
  const value = JSON.parse(readFileSync(new URL('../fixtures/backtest-execution-model.cn-2024q1.json', import.meta.url), 'utf8').replaceAll('CNY', 'HKD'));
  value.scope.market = 'HK'; value.scope.symbol = '00147.HK'; value.scope.timezone = 'Asia/Hong_Kong';
  value.segments[0].execution.calendarMarket = 'HK';
  value.segments[0].execution.price = { kind: 'noDailyLimit', reason: '港股日线研究' };
  value.researchLotSize = preset();
  return value;
};

describe('港股每手研究预设冻结契约', () => {
  it('默认值与显式覆盖独立保存，旧严格模型不接受新字段', () => {
    const value = model();
    expect(backtestExecutionModelSchemaV3.parse(value).researchLotSize).toEqual(preset());
    expect(backtestExecutionModelSchema.safeParse(value).success).toBe(false);
    value.researchLotSize.sharesPerLot = '1000'; value.researchLotSize.origin = 'userOverride';
    expect(backtestExecutionModelSchemaV3.parse(value).researchLotSize?.defaultSharesPerLot).toBe('5000');
  });
  it.each(['0', '-1', '0.5', '1.5', '1e3', '05000'])('非法数量%s不能成为整手参数', sharesPerLot => {
    expect(backtestResearchLotSizeSchema.safeParse({ ...preset(), sharesPerLot, origin: 'userOverride' }).success).toBe(false);
  });
  it('改值而不声明覆盖，以及伪造历史验证，均拒绝', () => {
    expect(backtestResearchLotSizeSchema.safeParse({ ...preset(), sharesPerLot: '1000' }).success).toBe(false);
    expect(backtestResearchLotSizeSchema.safeParse({ ...preset(), historicalChanges: 'verified' }).success).toBe(false);
  });
  it.each(['https://example.com/?token=private', 'https://user:password@example.com', 'javascript:alert(1)', 'invalid'])('来源引用%s不能携带凭据或执行协议', sourceUrl => {
    expect(backtestResearchLotSizeSchema.safeParse({ ...preset(), source: { ...preset().source, sourceUrl } }).success).toBe(false);
  });
  it('非港股、历史事实和归一化模型不能隐式应用预设', () => {
    const value = model(); value.scope.market = 'US'; value.segments[0].execution.calendarMarket = 'US';
    expect(backtestExecutionModelSchemaV3.safeParse(value).success).toBe(false);
    const historical = model(); historical.segments[0].source = { kind: 'historicalFact', knownAt: '2020-01-01T00:00:00Z',
      description: '历史规则', references: ['https://example.com'], revision: '1' };
    expect(backtestExecutionModelSchemaV3.safeParse(historical).success).toBe(false);
    expect(executionModelAccountingIssuesV3(backtestExecutionModelSchemaV3.parse(model()),
      { startDate: '2024-01-02', endDate: '2024-03-29' }, 'normalized-series').some(issue => issue.path.includes('researchLotSize'))).toBe(true);
  });
  it('当前来源时钟不回填历史，微秒级未来观察拒绝', () => {
    const value = backtestExecutionModelSchemaV3.parse(model());
    const run = { startDate: '2024-01-02', endDate: '2024-03-29', dataAsOf: '2026-10-08T08:57:12.937457Z' };
    expect(executionModelRunIssues(value, run).some(issue => issue.path.includes('researchLotSize'))).toBe(true);
    expect(executionModelRunIssues(value, { ...run, dataAsOf: '2026-10-08T09:00:00Z' })).toEqual([]);
  });
  it('未配置预设的旧模型保留原形状', () => {
    const value = model(); delete value.researchLotSize;
    expect(backtestExecutionModelSchemaV3.parse(value)).toEqual(backtestExecutionModelSchema.parse(value));
  });
});
