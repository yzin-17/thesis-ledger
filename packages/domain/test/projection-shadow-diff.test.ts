import { describe, expect, it } from 'vitest';
import {
  compareProjectionSnapshots,
  evaluateProjectionSwitch,
  parseProjectionReadMode,
  type ProjectionSnapshot,
} from '../src/index.js';

const makeSnapshot = (overrides: Partial<ProjectionSnapshot> = {}): ProjectionSnapshot => ({
  accountId: '11111111-1111-4111-8111-111111111111',
  mode: 'actual',
  positions: [{ symbol: '600519.SH', quantity: '100', averageCost: '10', realizedPnl: '187' }],
  trades: [
    {
      id: 'trade-1',
      symbol: '600519.SH',
      closedQuantity: '100',
      remainingQuantity: '0',
      netRealizedPnl: '187',
      evidenceComplete: true,
    },
  ],
  cash: [
    {
      currency: 'CNY',
      settledAmount: '1000',
      pendingReceivable: '0',
      pendingPayable: '0',
      convertedAmount: '1000',
      fxComplete: true,
    },
  ],
  journal: {
    tradeCycleCount: 1,
    closeSliceCount: 1,
    statisticsEligibleCount: 1,
    legacyCandidateCount: 1,
  },
  ...overrides,
});

describe('projection shadow diff', () => {
  it('相同快照通过门禁并保持稳定分类计数', () => {
    const report = compareProjectionSnapshots(makeSnapshot(), makeSnapshot(), {
      generatedAt: '2026-08-28T00:00:00.000Z',
    });
    expect(report.gate).toMatchObject({ status: 'PASS', migrationAndAlgorithmClean: true });
    expect(report.differences).toEqual([]);
    expect(report.generatedAt).toBe('2026-08-28T00:00:00.000Z');
  });

  it('把统计粒度、证据不足和 FX 不完整分别分类', () => {
    const legacy = makeSnapshot({
      cash: [
        {
          currency: 'CNY',
          settledAmount: '1000',
          pendingReceivable: '0',
          pendingPayable: '0',
          convertedAmount: '1000',
          fxComplete: true,
        },
        {
          currency: 'HKD',
          settledAmount: '1000',
          pendingReceivable: '0',
          pendingPayable: '0',
          convertedAmount: '900',
          fxComplete: true,
        },
      ],
      journal: {
        tradeCycleCount: 2,
        closeSliceCount: 2,
        statisticsEligibleCount: 2,
        legacyCandidateCount: 2,
      },
    });
    const unified = makeSnapshot({
      positions: [
        {
          symbol: '600519.SH',
          quantity: null,
          averageCost: '10',
          realizedPnl: '187',
          evidenceComplete: false,
        },
      ],
      cash: [
        {
          currency: 'HKD',
          settledAmount: '1000',
          pendingReceivable: '0',
          pendingPayable: '0',
          convertedAmount: null,
          fxComplete: false,
        },
      ],
      journal: {
        tradeCycleCount: 1,
        closeSliceCount: 1,
        statisticsEligibleCount: 1,
        legacyCandidateCount: 2,
      },
    });
    const report = compareProjectionSnapshots(legacy, unified);
    expect(report.counts.EXPECTED_GRAIN_CHANGE).toBeGreaterThan(0);
    expect(report.counts.EVIDENCE_GAP).toBeGreaterThan(0);
    expect(report.counts.FX_GAP).toBe(1);
    expect(report.counts.MIGRATION_DEFECT).toBeGreaterThan(0);
    expect(report.gate.status).toBe('BLOCKED');
  });

  it('可比数值不一致时阻断算法切换，读取切换要求完整阶段', () => {
    const legacy = makeSnapshot();
    const unified = makeSnapshot({
      positions: [{ symbol: '600519.SH', quantity: '101', averageCost: '10', realizedPnl: '187' }],
    });
    const report = compareProjectionSnapshots(legacy, unified);
    expect(report.counts.ALGORITHM_DEFECT).toBe(1);
    expect(
      evaluateProjectionSwitch({
        targetMode: 'unified',
        completedStages: ['trade-query'],
        report,
      }).allowed,
    ).toBe(false);
    const cleanReport = compareProjectionSnapshots(makeSnapshot(), makeSnapshot());
    expect(
      evaluateProjectionSwitch({
        targetMode: 'unified',
        completedStages: ['trade-query', 'account-data', 'portfolio', 'journal'],
        report: cleanReport,
      }).allowed,
    ).toBe(true);
  });

  it('回滚必须有检查点且禁止配平原始事实', () => {
    const report = compareProjectionSnapshots(makeSnapshot(), makeSnapshot());
    expect(
      evaluateProjectionSwitch({
        targetMode: 'legacy',
        completedStages: [],
        report,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateProjectionSwitch({
        targetMode: 'legacy',
        completedStages: [],
        report,
        rollbackCheckpointAvailable: true,
        sourceLedgerMutated: true,
      }),
    ).toMatchObject({
      allowed: false,
      reasons: ['切换门禁不允许通过修改原始 Ledger 事实配平差异'],
    });
    expect(parseProjectionReadMode('shadow')).toBe('shadow');
    expect(() => parseProjectionReadMode('invalid')).toThrow('PROJECTION_READ_MODE 无效');
  });
});
