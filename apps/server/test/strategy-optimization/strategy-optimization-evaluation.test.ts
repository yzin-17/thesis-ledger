import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { evaluateOptimizationResult } from '../../src/strategy-optimization/strategy-optimization-evaluation.js';

const resultBase = () => ({
  source: 'BACKTEST',
  runId: 'run-1',
  strategyVersionId: 'strategy',
  snapshotId: 'snapshot',
  engineVersion: 'v3',
  schemaVersion: 'backtest-trade-result-v1',
  marketRuleVersion: 'v1',
  calendarVersion: 'v1',
  aggregationVersion: 'v1',
  contentHash: 'hash',
  resultChecksum: 'checksum',
  completeness: 'complete',
  warnings: [],
  rejectedOrders: [],
  simulationFills: [],
  trades: [],
  equityCurve: [],
  metrics: {
    totalReturn: { status: 'available', value: '-0.12' },
    maxDrawdown: { status: 'available', value: '-0.15' },
  },
});
const resultV3 = () => {
  const manifest = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-snapshot-v3.manifest.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return {
    ...resultBase(),
    snapshotVersion: 'backtest-trade-snapshot-manifest-v1',
    executionPriceProtocol: manifest.executionPriceProtocol,
    comparableDataFingerprint: manifest.comparableDataFingerprint,
    actualSources: manifest.actualSources,
  };
};
const evaluate = (result: unknown) =>
  evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'return', minClosedTrades: 0 });

describe('优化评价的当前结果边界', () => {
  it('新版收益目标仅要求收益指标，零波动不阻断，硬回撤约束仍要求回撤', () => {
    const base = resultV3();
    const result = { ...base, analyticsVersion: 'research-analytics-v2', completeness: 'partial', metrics: {
      totalReturn: { status: 'available', value: '0' },
      sharpe: { status: 'unavailable', reason: 'ZERO_VOLATILITY' },
      tradedNotional: { status: 'available', value: '0' },
      turnoverRate: { status: 'available', value: '0' },
    } };
    expect(evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'return', minClosedTrades: 0 }))
      .toMatchObject({ status: 'valid', score: 0, completeness: 'partial' });
    expect(evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'lowTurnover', minClosedTrades: 0 }))
      .toMatchObject({ status: 'valid' });
    expect(evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'return', minClosedTrades: 0, maxDrawdown: '0.1' }))
      .toMatchObject({ status: 'invalid', failureCategory: 'data-unavailable' });
    expect(evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'return', minClosedTrades: 1 }))
      .toMatchObject({ status: 'invalid', failureCategory: 'strategy-ineligible' });
  });
  it('未适用退出不阻断，关键入场全程不可计算则具体指出规则', () => {
    const base = resultV3();
    const rule = { ruleId: 'exit', path: ['exit'], observations: 100,
      computableObservations: 0, trueObservations: 0, applicableDecisions: 0,
      computableDecisions: 0, warmupObservations: 0, unavailableReasons: [] };
    const result = { ...base, analyticsVersion: 'research-analytics-v2', completeness: 'partial',
      metrics: { ...base.metrics, tradedNotional: { status: 'available', value: '0' },
        turnoverRate: { status: 'available', value: '0' } },
      ruleDiagnostics: { version: 'rule-evaluation-v1', rules: [rule] },
    };
    expect(evaluateOptimizationResult({ id: 'run-1', result }, { mode: 'return', minClosedTrades: 0 }))
      .toMatchObject({ status: 'valid' });
    const invalid = evaluateOptimizationResult({ id: 'run-1', result: { ...result,
      ruleDiagnostics: { ...result.ruleDiagnostics, rules: [{ ...rule, ruleId: 'entry', path: ['entry'], applicableDecisions: 100 }] },
    } }, { mode: 'return', minClosedTrades: 0 });
    expect(invalid).toMatchObject({ status: 'invalid', failureCategory: 'data-unavailable' });
    expect(invalid.reason).toContain('entry');
  });
  it('新评分采用归一化周转率，旧金额不会成为新别名', () => {
    const base = resultV3();
    const result = { ...base, analyticsVersion: 'research-analytics-v2', metrics: {
      ...base.metrics,
      tradedNotional: { status: 'available', value: '1500' },
      turnoverRate: { status: 'available', value: '1.5' },
      turnover: { status: 'available', value: '999999' },
    } };
    const summary = evaluateOptimizationResult({ id: 'run-1', result },
      { mode: 'balanced', minClosedTrades: 0 });
    expect(summary).toMatchObject({ status: 'valid', analyticsVersion: 'research-analytics-v2',
      scoreVersion: 'optimization-score-v2', tradedNotional: '1500', turnoverRate: '1.5' });
    expect(summary.score).toBeCloseTo(-0.345);
    expect(summary.turnover).toBeUndefined();
    const missing = evaluateOptimizationResult({ id: 'run-1', result: { ...result,
      metrics: { ...result.metrics, turnoverRate: { status: 'unavailable', reason: 'FX_UNAVAILABLE' } },
    } }, { mode: 'balanced', minClosedTrades: 0 });
    expect(missing).toMatchObject({ status: 'invalid', failureCategory: 'data-unavailable' });
    expect(missing.score).toBeUndefined();
  });
  it.each(['balanced', 'lowTurnover'])('%s缺换手率时不能按零值入榜', (mode) => {
    const summary = evaluateOptimizationResult(
      { id: 'run-1', result: resultV3() },
      { mode, minClosedTrades: 0 },
    );
    expect(summary).toMatchObject({ status: 'invalid', failureCategory: 'data-unavailable' });
    expect(summary).not.toHaveProperty('score');
  });
  it('亏损保留为真实负收益', () => {
    expect(evaluate(resultV3())).toMatchObject({
      status: 'valid',
      totalReturn: '-0.12',
      maxDrawdown: '-0.15',
      score: -0.12,
      fillCount: 0,
      rejectedOrderCount: 0,
    });
  });
  it('不完整数据不参加评分', () => {
    const summary = evaluate({ ...resultV3(), completeness: 'partial' });
    expect(summary).toMatchObject({
      status: 'invalid',
      completeness: 'partial',
      failureCategory: 'data-unavailable',
    });
    expect(summary).not.toHaveProperty('score');
    expect(summary).toHaveProperty('totalReturn', '-0.12');
  });
  it('缺少关键指标不会冒充零收益', () => {
    const summary = evaluate({ ...resultV3(), metrics: {} });
    expect(summary).toMatchObject({
      status: 'invalid',
      reason: '关键收益/回撤指标不可用',
      failureCategory: 'data-unavailable',
    });
    expect(summary).not.toHaveProperty('score');
  });
  it('损坏协议和旧版及未知版本均失败关闭', () => {
    expect(() => evaluate({ ...resultV3(), executionPriceProtocol: undefined })).toThrow();
    expect(() => evaluate({ ...resultV3(), schemaVersion: '4' })).toThrow();
    expect(() => evaluate({ ...resultV3(), schemaVersion: '2' })).toThrow();
  });
  it('执行约束保持有效，低交易数不是通过的评价', () => {
    const summary = evaluateOptimizationResult(
      { id: 'run-1', result: resultV3() },
      { mode: 'return', minClosedTrades: 1 },
    );
    expect(summary).toMatchObject({
      status: 'invalid',
      reason: '闭合交易少于 1',
      failureCategory: 'strategy-ineligible',
    });
    expect(summary).not.toHaveProperty('score');
  });
  it('策略回撤超限与数据缺失分别分类，均不生成排名分数', () => {
    const summary = evaluateOptimizationResult(
      { id: 'run-1', result: resultV3() },
      { mode: 'return', minClosedTrades: 0, maxDrawdown: '0.1' },
    );
    expect(summary).toMatchObject({
      status: 'invalid',
      failureCategory: 'strategy-performance',
      totalReturn: '-0.12',
    });
    expect(summary).not.toHaveProperty('score');
  });
});
