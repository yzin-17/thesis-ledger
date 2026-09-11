import { describe, expect, it } from 'vitest';
import { calculateOptimizationScore } from '../../src/strategy-optimization/strategy-optimization-run.service.js';

describe('strategy optimization scoring', () => {
  it('uses turnover itself as the low-turnover ranking objective', () => {
    expect(calculateOptimizationScore('lowTurnover', '0.50', '0.20', '0.10')).toBe(-0.1);
    expect(calculateOptimizationScore('lowTurnover', '0.01', '0.20', '0.05')).toBe(-0.05);
  });

  it('keeps return and drawdown modes independent', () => {
    expect(calculateOptimizationScore('return', '0.12', '0.08', '0.30')).toBe(0.12);
    expect(calculateOptimizationScore('drawdown', '0.12', '-0.08', '0.30')).toBe(-0.08);
  });
});
