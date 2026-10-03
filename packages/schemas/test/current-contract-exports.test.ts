import { describe, expect, it } from 'vitest';
import * as contracts from '../src/index.js';
import * as domain from '@thesis-ledger/domain';

describe('现行公共合同边界', () => {
  it('只公开当前解析器并保留实际经济能力', () => {
    for (const retired of [
      'strategySchemaV1',
      'runConfigSchemaV2',
      'runConfigSchema',
      'ledgerEventEnvelopeSchemaV2',
      'backtestTradeSchemaV2',
    ]) {
      expect(contracts).not.toHaveProperty(retired);
    }
    for (const current of [
      'strategySchema',
      'runConfigSchemaV3',
      'ledgerEventEnvelopeSchema',
      'executionCommandSchema',
      'backtestTradeSchema',
    ]) {
      expect(contracts).toHaveProperty(current);
    }
    for (const retired of [
      'runBacktest',
      'simulateAStockExecution',
      'projectAverageCost',
      'projectFifo',
      'projectCashBalance',
      'compareBenchmark',
      'legacyZeroCostBenchmarkAssumption',
    ]) {
      expect(domain).not.toHaveProperty(retired);
    }
    for (const current of [
      'runExchangeSimulation',
      'SimulationLedger',
      'CnNavSimulation',
      'buildBacktestAnalytics',
      'calculateBuyAndHoldReturn',
    ]) {
      expect(domain).toHaveProperty(current);
    }
  });
});
