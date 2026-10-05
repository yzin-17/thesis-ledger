import { describe, expect, it } from 'vitest';
import { journalAnalyze } from '../src/journal-analysis.js';
import { journalAnalysisFixture, journalSliceAnalysisFixture } from './journal-analysis.fixture.js';

describe('decimal 确定性复盘', () => {
  it('草稿补充独立假设，保留原始计划和实际事实', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.analysisDraft = { plannedExit: '14', stopLoss: '8', note: '本次复盘假设' };
    const before = structuredClone(candidate);
    const result = journalAnalyze(candidate);
    expect(result.metrics.plannedEntryPrice!.value).toBe('10');
    expect(result.metrics.plannedExitPrice!.value).toBe('14');
    expect(result.metrics.actualExitPrice!.value).toBe('12');
    expect(result.metrics.counterfactualNetPnl!.value).toBe('-4');
    expect(candidate).toEqual(before);
    expect(candidate.input.plan!.stopLoss).toBe('9');
  });
  it('草稿可在无计划时补充，显式 null 清除而省略字段继承原计划', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.analysisDraft = { plannedExit: null };
    const cleared = journalAnalyze(candidate);
    expect(cleared.metrics.plannedExitPrice!.value).toBeNull();
    expect(cleared.metrics.plannedEntryPrice!.value).toBe('10');
    candidate.input.plan = null;
    candidate.input.analysisDraft = { plannedEntry: '11', stopLoss: '8' };
    const supplemented = journalAnalyze(candidate);
    expect(supplemented.metrics.plannedEntryPrice!.value).toBe('11');
    expect(supplemented.metrics.netRealizedPnl!.value).toBe('4');
    expect(supplemented.metrics.counterfactualNetPnl!.value).toBe('-4');
  });
  it('计划、实际、偏差和真实量反事实使用同一对象', () => {
    const result = journalAnalyze(journalAnalysisFixture());
    expect(result.reviewObjectId).toBe('TRADE_CYCLE:trade-1');
    expect(result.metrics.actualEntryPrice!.value).toBe('10');
    expect(result.metrics.actualExitPrice!.value).toBe('12');
    expect(result.metrics.exitPriceDeviation!.value).toBe('-1');
    expect(result.metrics.actualHoldingDays!.value).toBe('2');
    expect(result.metrics.holdingDayDeviation!.value).toBe('-1');
    expect(result.metrics.netRealizedPnl!.value).toBe('4');
    expect(result.metrics.counterfactualNetPnl!.value).toBe('-2');
    expect(result.metrics.counterfactualDifference!.value).toBe('-6');
    expect(result.assumptions[0]).toContain('实际数量');
    expect(result.behaviors.map((row) => row.status)).toEqual([
      'NO_DEVIATION',
      'DEVIATION',
      'DEVIATION',
      'NO_DEVIATION',
    ]);
  });
  it('减仓片段与 ACTIVE 父周期分离，收益和持有时间只取当前片段', () => {
    const candidate = journalSliceAnalysisFixture();
    candidate.input.trade.lifecycle = 'ACTIVE';
    candidate.input.trade.closedAt = null;
    const result = journalAnalyze(candidate);
    expect(result.metrics.netRealizedPnl!.value).toBe('2');
    expect(result.metrics.actualHoldingDays!.value).toBe('1');
    expect(result.metrics.executedQuantity!.value).toBe('1');
    expect(result.metrics.counterfactualNetPnl!.value).toBe('-1');
  });
  it('未知 openedAt 仅降级持有时间，已有收益和退出价保持可用', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.trade.openedAt = null;
    candidate.statisticsEligibility = { eligible: false, reasons: ['UNKNOWN_OPENED_AT'] };
    const result = journalAnalyze(candidate);
    expect(result.metrics.actualHoldingDays).toMatchObject({
      value: null,
      missingEvidence: ['UNKNOWN_OPENED_AT'],
    });
    expect(result.metrics.netRealizedPnl!.value).toBe('4');
    expect(result.metrics.actualExitPrice!.value).toBe('12');
    expect(result.behaviors[2]!.status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('没有计划不妨碍实际指标，但不生成计划偏差或假设值', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.plan = null;
    const result = journalAnalyze(candidate);
    expect(result.metrics.netRealizedPnl!.value).toBe('4');
    expect(result.metrics.counterfactualNetPnl!.value).toBeNull();
    expect(result.metrics.counterfactualNetPnl!.missingEvidence).toContain('PLANNED_STOP_MISSING');
    expect(result.behaviors.every((row) => row.status === 'INSUFFICIENT_EVIDENCE')).toBe(true);
  });
  it('大数和亚单位数量不经过 number，止损反事实使用真实减仓数量', () => {
    const candidate = journalSliceAnalysisFixture();
    const slice = candidate.input.trade.closeSlices[0]!;
    slice.quantity = '9007199254740993.000000000000000001';
    slice.price = '10';
    slice.netRealizedPnl = '0';
    candidate.input.plan!.stopLoss = '11';
    const result = journalAnalyze(candidate);
    expect(result.metrics.executedQuantity!.value).toBe(slice.quantity);
    expect(result.metrics.counterfactualNetPnl!.value).toBe('9007199254740993');
    expect(candidate.input.trade.closeSlices[0]!.quantity).toBe(slice.quantity);
  });
  it('从原始值计算后再舍入，避免先舍入计划和实际造成虚假偏差', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.trade.entryLegs[0]!.price = '1.000000006';
    candidate.input.plan!.plannedEntry = '1.000000004';
    candidate.input.trade.netRealizedPnl = '-0.000000005';
    const result = journalAnalyze(candidate);
    expect(result.metrics.actualEntryPrice!.value).toBe('1.00000001');
    expect(result.metrics.plannedEntryPrice!.value).toBe('1');
    expect(result.metrics.entryPriceDeviation!.value).toBe('0');
    expect(result.metrics.netRealizedPnl!.value).toBe('-0.00000001');
    expect(candidate.input.trade.entryLegs[0]!.price).toBe('1.000000006');
  });
  it('Baseline 不伪造成交价或开仓时间，已知净收益仍保留', () => {
    const candidate = journalSliceAnalysisFixture();
    candidate.input.trade.openedAt = null;
    candidate.input.trade.closeSlices[0]!.allocations[0]!.source = 'BASELINE_COMPONENT';
    const result = journalAnalyze(candidate);
    expect(result.metrics.actualEntryPrice!.missingEvidence).toContain('BASELINE_NOT_EXECUTION');
    expect(result.metrics.actualHoldingDays!.value).toBeNull();
    expect(result.metrics.netRealizedPnl!.value).toBe('2');
  });
  it('FX 缺失与成本冲突不生成金额，未知成本不填零', () => {
    for (const reason of ['FX_MISSING', 'COST_CONFLICT'] as const) {
      const candidate = journalAnalysisFixture();
      candidate.statisticsEligibility = { eligible: false, reasons: [reason] };
      const result = journalAnalyze(candidate);
      expect(result.metrics.netRealizedPnl).toMatchObject({
        value: null,
        missingEvidence: [reason],
      });
      expect(result.metrics.counterfactualNetPnl!.value).toBeNull();
    }
    const candidate = journalAnalysisFixture();
    candidate.input.trade.netRealizedPnl = null;
    expect(journalAnalyze(candidate).metrics.netRealizedPnl!.value).toBeNull();
  });
  it('没有 SELL 时已实现交易收益不适用，不冒充零收益', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.trade.closeSlices = [];
    candidate.input.trade.closedAt = null;
    candidate.input.trade.lifecycle = 'ACTIVE';
    const result = journalAnalyze(candidate);
    expect(result.metrics.netRealizedPnl!.status).toBe('NOT_APPLICABLE');
    expect(result.metrics.counterfactualNetPnl!.value).toBeNull();
  });
  it('公司行动后的价格单位不明时降级，片段之后的行动与 BUY 不改变旧结果', () => {
    const candidate = journalSliceAnalysisFixture();
    const before = journalAnalyze(candidate);
    candidate.input.trade.corporateActions = [{ occurredAt: '2026-01-03T09:00:00Z' }];
    candidate.input.trade.entryLegs = [
      ...candidate.input.trade.entryLegs,
      { factId: 'later-buy', currency: 'USD', price: '999', originalQuantity: '20' },
    ];
    expect(journalAnalyze(candidate)).toEqual(before);
    candidate.input.trade.corporateActions = [{ occurredAt: '2026-01-01T09:00:00Z' }];
    const after = journalAnalyze(candidate);
    expect(after.metrics.actualEntryPrice!.missingEvidence).toContain(
      'CORPORATE_ACTION_PRICE_BASIS',
    );
    expect(after.metrics.actualExitPrice!.value).toBe('12');
    expect(after.metrics.counterfactualNetPnl!.value).toBeNull();
    expect(after.behaviors[1]!.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(after.behaviors[3]!.status).toBe('INSUFFICIENT_EVIDENCE');
  });
  it('负止损、零计划价与矛盾时间不形成可用偏差或假设金额', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.plan!.stopLoss = '-1';
    candidate.input.plan!.plannedEntry = '0';
    candidate.input.trade.openedAt = '2026-01-04T09:00:00Z';
    const result = journalAnalyze(candidate);
    expect(result.metrics.entryPriceDeviationRatio!.missingEvidence).toContain(
      'PLANNED_ENTRY_NON_POSITIVE',
    );
    expect(result.metrics.counterfactualNetPnl!.missingEvidence).toContain(
      'STOP_PRICE_NON_POSITIVE',
    );
    expect(result.behaviors[3]!.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(result.metrics.actualHoldingDays!.missingEvidence).toContain('TIME_ORDER_CONFLICT');
  });
  it('原始成交量加权价格与实际费用保留，不使用简单均值或归一化一单位', () => {
    const candidate = journalAnalysisFixture();
    candidate.input.trade.entryLegs = [
      { factId: 'buy-1', currency: 'USD', price: '10', originalQuantity: '1' },
      { factId: 'buy-2', currency: 'USD', price: '20', originalQuantity: '3' },
    ];
    expect(journalAnalyze(candidate).metrics.actualEntryPrice!.value).toBe('17.5');
    const single = journalSliceAnalysisFixture();
    single.input.trade.closeSlices[0]!.quantity = '3';
    single.input.trade.closeSlices[0]!.netRealizedPnl = '5.7';
    expect(journalAnalyze(single).metrics.counterfactualNetPnl!.value).toBe('-3.3');
  });
});
