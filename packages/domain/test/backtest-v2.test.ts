import { describe, expect, it } from 'vitest';
import {
  expressionOutputKind,
  type BacktestCorporateActionEventType,
  type BooleanExpression,
} from '../src/backtest-contract.js';

const corporateActionEventTypes = [
  'CASH_DIVIDEND',
  'SPLIT',
  'REVERSE_SPLIT',
] as const satisfies readonly BacktestCorporateActionEventType[];

describe('V2 expression contract', () => {
  it('classifies corporate-action event dependencies as Boolean expressions', () => {
    for (const eventType of corporateActionEventTypes) {
      const expression: BooleanExpression = { type: 'corporateActionEvent', eventType };
      expect(expressionOutputKind(expression)).toBe('boolean');
    }
  });
});
