import { describe, expect, it } from 'vitest';
import {
  backtestPreflightDiagnosticV3Schema,
  type BacktestPreflightRequirementV3,
  type BacktestPreflightTargetSourceV3,
} from '@thesis-ledger/schemas';
import {
  mapBacktestDependencyIssueToPreflightDiagnosticV3,
  type BacktestPreflightDiagnosticContext,
} from '../../src/backtest/backtest-preflight-diagnostics.js';
import type { BacktestDependencyPlanIssue } from '../../src/backtest/backtest-dependency-plan.js';

const requirement: BacktestPreflightRequirementV3 = {
  symbol: '159516.SZ',
  capability: 'DAILY_BAR',
  purpose: 'execution',
  dateRange: { startDate: '2026-05-18', endDate: '2026-08-09' },
  routeKey: {
    kind: 'bar',
    market: 'CN',
    assetType: 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'qfq',
  },
};

const targetSources: BacktestPreflightTargetSourceV3[] = [
  { providerId: 'provider-a', upstreamSource: 'adapter-a', routeIndex: 0 },
];

const context = (
  overrides: Partial<BacktestPreflightDiagnosticContext> = {},
): BacktestPreflightDiagnosticContext => ({
  requirement,
  targetSources,
  missingFields: [],
  incompatibleRules: [],
  ...overrides,
});

const issue = (code: BacktestDependencyPlanIssue['code']): BacktestDependencyPlanIssue => ({
  code,
  path: [],
  message: 'Planner message is intentionally not interpreted as a field or source.',
});

describe('backtest preflight diagnostics mapper', () => {
  it('maps every dependency-plan issue to a strict diagnostic with an existing error code', () => {
    const cases = [
      ['INVALID_WARMUP_RANGE', 'input-invalid', 'INVALID_PARAMETER', 'correct-input'],
      [
        'EVENT_COVERAGE_UNAVAILABLE',
        'insufficient-coverage',
        'DATA_UNAVAILABLE',
        'repair-data-coverage',
      ],
      [
        'EVENT_COVERAGE_INCOMPLETE',
        'insufficient-coverage',
        'DATA_UNAVAILABLE',
        'repair-data-coverage',
      ],
      [
        'EVENT_EFFECTIVE_DATE_MISSING',
        'data-unavailable',
        'DATA_UNAVAILABLE',
        'repair-data-coverage',
      ],
      [
        'EVENT_STRATEGY_VISIBILITY_MISSING',
        'point-in-time-unavailable',
        'DATA_UNAVAILABLE',
        'provide-point-in-time-evidence',
      ],
      [
        'EVENT_FACT_AFTER_DATA_AS_OF',
        'point-in-time-unavailable',
        'FUTURE_DATA',
        'provide-point-in-time-evidence',
      ],
      [
        'EXECUTION_PRICE_COORDINATE_MISMATCH',
        'incompatible-price-basis',
        'DATA_UNAVAILABLE',
        'select-compatible-route',
      ],
      ['RULE_INCOMPATIBLE', 'rule-incompatible', 'RULE_REJECTED', 'review-strategy-rules'],
    ] as const;

    for (const [plannerCode, category, code, action] of cases) {
      const diagnostic = mapBacktestDependencyIssueToPreflightDiagnosticV3(
        issue(plannerCode),
        context(),
      );
      expect(backtestPreflightDiagnosticV3Schema.parse(diagnostic)).toEqual(diagnostic);
      expect(diagnostic).toMatchObject({
        severity: 'error',
        category,
        code,
        symbol: requirement.symbol,
        capability: requirement.capability,
        purpose: requirement.purpose,
        dateRange: requirement.dateRange,
        routeKey: requirement.routeKey,
        targetSources,
        suggestedActions: [{ action }],
      });
    }
  });

  it('carries explicitly supplied missing fields, incompatible rules, and exact targets', () => {
    const diagnostic = mapBacktestDependencyIssueToPreflightDiagnosticV3(
      issue('RULE_INCOMPATIBLE'),
      context({
        missingFields: ['executionModel.realLotSize'],
        incompatibleRules: ['VOLUME_PARTICIPATION_UNSUPPORTED'],
      }),
    );

    expect(diagnostic).toMatchObject({
      missingFields: ['executionModel.realLotSize'],
      incompatibleRules: ['VOLUME_PARTICIPATION_UNSUPPORTED'],
      targetSources,
    });
  });

  it('marks an absent target as explicitly unknown without inventing a provider', () => {
    const diagnostic = mapBacktestDependencyIssueToPreflightDiagnosticV3(
      issue('EVENT_COVERAGE_UNAVAILABLE'),
      context({ targetSources: [] }),
    );

    expect(diagnostic.targetSources).toEqual([]);
    expect(diagnostic.message).toContain('精确来源目标未知');
    expect(diagnostic.message).not.toContain('provider-a');
    expect(backtestPreflightDiagnosticV3Schema.safeParse(diagnostic).success).toBe(true);
  });

  it('returns a stable fail-closed diagnostic when explicit requirement context is absent', () => {
    const first = mapBacktestDependencyIssueToPreflightDiagnosticV3(
      issue('EVENT_COVERAGE_UNAVAILABLE'),
    );
    const second = mapBacktestDependencyIssueToPreflightDiagnosticV3(issue('RULE_INCOMPATIBLE'));

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      severity: 'error',
      category: 'input-invalid',
      code: 'INVALID_PARAMETER',
      symbol: null,
      capability: null,
      purpose: null,
      dateRange: null,
      routeKey: null,
      missingFields: ['preflightRequirementContext'],
      targetSources: [],
      suggestedActions: [{ action: 'correct-input' }],
    });
    expect(first.message).toContain('拒绝');
    expect(backtestPreflightDiagnosticV3Schema.safeParse(first).success).toBe(true);
  });

  it('uses no inferred field or rule details when the planner message is insufficient', () => {
    const diagnostic = mapBacktestDependencyIssueToPreflightDiagnosticV3(
      issue('EVENT_COVERAGE_INCOMPLETE'),
      context(),
    );

    expect(diagnostic.missingFields).toEqual([]);
    expect(diagnostic.incompatibleRules).toEqual([]);
    expect(diagnostic.message).not.toContain('Planner message');
  });
});
