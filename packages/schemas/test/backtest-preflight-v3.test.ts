import { describe, expect, it } from 'vitest';
import {
  backtestPreflightDiagnosticV3Schema,
  backtestPreflightRequestV3Schema,
  backtestPreflightResultV3Schema,
  backtestPreflightRevisionStampV3Schema,
  type BacktestPreflightDiagnosticV3,
} from '../src/backtest-preflight-v3.js';

const routeKey = {
  kind: 'bar' as const,
  market: 'CN' as const,
  assetType: 'ETF' as const,
  capability: 'DAILY_BAR' as const,
  timeframe: '1d' as const,
  adjustment: 'qfq' as const,
};

const requirement = {
  symbol: '159516.SZ',
  capability: 'DAILY_BAR',
  purpose: 'execution' as const,
  dateRange: { startDate: '2026-05-18', endDate: '2026-05-20' },
  routeKey,
};

const request = {
  contractVersion: 3 as const,
  requestId: 'preflight-159516',
  strategyVersionId: 'strategy-version-7',
  strategyContentHash: 'a'.repeat(64),
  runConfigChecksum: 'b'.repeat(64),
  requirements: [requirement],
};

const targetSources = [
  { providerId: 'provider-a', upstreamSource: 'adapter-a', routeIndex: 0 },
  { providerId: 'provider-b', upstreamSource: 'adapter-b', routeIndex: 1 },
];

const revisionStamp = {
  strategyVersionId: request.strategyVersionId,
  strategyContentHash: request.strategyContentHash,
  runConfigChecksum: request.runConfigChecksum,
  desiredRevision: 7,
  effectiveRevision: 12,
  catalogRevision: 20,
  targetSequences: [{ requirement, targets: targetSources }],
};

const diagnostic = (
  overrides: Partial<BacktestPreflightDiagnosticV3> = {},
): BacktestPreflightDiagnosticV3 => ({
  severity: 'error',
  category: 'insufficient-coverage',
  code: 'DATA_UNAVAILABLE',
  message: '所选来源未覆盖完整研究窗口',
  symbol: requirement.symbol,
  capability: requirement.capability,
  purpose: requirement.purpose,
  dateRange: requirement.dateRange,
  routeKey,
  missingFields: ['2026-05-20'],
  incompatibleRules: [],
  targetSources,
  suggestedActions: [{ action: 'repair-data-coverage', description: '修复缺失交易日后重试预检' }],
  ...overrides,
});

describe('backtest preflight V3 contract', () => {
  it('accepts compact request references and binds all revisions and ordered targets', () => {
    expect(backtestPreflightRequestV3Schema.parse(request)).toEqual(request);
    expect(backtestPreflightRevisionStampV3Schema.parse(revisionStamp)).toEqual(revisionStamp);
  });

  it('rejects quote payloads, model output, unknown fields, and nonconsecutive targets', () => {
    expect(
      backtestPreflightRequestV3Schema.safeParse({ ...request, bars: [{ close: '10' }] }).success,
    ).toBe(false);
    expect(
      backtestPreflightRequestV3Schema.safeParse({ ...request, modelOutput: 'buy' }).success,
    ).toBe(false);
    expect(
      backtestPreflightRequestV3Schema.safeParse({ ...request, runConfig: { ...request } }).success,
    ).toBe(false);
    expect(
      backtestPreflightRevisionStampV3Schema.safeParse({
        ...revisionStamp,
        targetSequences: [{ requirement, targets: [{ ...targetSources[1]!, routeIndex: 1 }] }],
      }).success,
    ).toBe(false);
    expect(backtestPreflightRequestV3Schema.safeParse({ ...request, extra: true }).success).toBe(
      false,
    );
  });

  it('keeps distinct failure categories while reusing existing backtest error codes', () => {
    const cases = [
      ['unsupported-adjustment', 'UNSUPPORTED_CAPABILITY'],
      ['incompatible-accounting', 'RULE_REJECTED'],
      ['incompatible-price-basis', 'DATA_UNAVAILABLE'],
      ['insufficient-coverage', 'DATA_UNAVAILABLE'],
      ['point-in-time-unavailable', 'FUTURE_DATA'],
      ['invalid-price-series', 'DATA_UNAVAILABLE'],
      ['auth-or-quota-unavailable', 'DATA_UNAVAILABLE'],
    ] as const;

    for (const [category, code] of cases) {
      const parsed = backtestPreflightDiagnosticV3Schema.parse(diagnostic({ category, code }));
      expect(parsed.category).toBe(category);
      expect(parsed.code).toBe(code);
    }

    expect(
      backtestPreflightDiagnosticV3Schema.safeParse(
        diagnostic({ category: 'insufficient-coverage', code: 'FUTURE_DATA' }),
      ).success,
    ).toBe(false);
  });

  it('requires actionable scope details and exact target sources in each diagnostic', () => {
    expect(backtestPreflightDiagnosticV3Schema.parse(diagnostic())).toMatchObject({
      symbol: '159516.SZ',
      capability: 'DAILY_BAR',
      purpose: 'execution',
      dateRange: requirement.dateRange,
      missingFields: ['2026-05-20'],
      targetSources,
      suggestedActions: [{ action: 'repair-data-coverage' }],
    });
    expect(
      backtestPreflightDiagnosticV3Schema.safeParse(diagnostic({ suggestedActions: [] })).success,
    ).toBe(false);
    expect(
      backtestPreflightDiagnosticV3Schema.safeParse(diagnostic({ capability: 'MINUTE_BAR' }))
        .success,
    ).toBe(false);
  });

  it('separates ready, blocked, and invalid-input result states', () => {
    const common = {
      contractVersion: 3 as const,
      requestId: request.requestId,
      checkedAt: '2026-05-21T00:00:00Z',
    };
    const ready = {
      ...common,
      status: 'ready' as const,
      revisionStamp,
      diagnostics: [diagnostic({ severity: 'warning' })],
    };
    const blocked = {
      ...common,
      status: 'blocked' as const,
      revisionStamp,
      diagnostics: [diagnostic()],
    };
    const invalidInput = {
      ...common,
      status: 'invalid-input' as const,
      revisionStamp: null,
      diagnostics: [
        diagnostic({
          category: 'input-invalid',
          code: 'INVALID_SCHEMA',
          symbol: null,
          capability: null,
          purpose: null,
          dateRange: null,
          routeKey: null,
          missingFields: ['strategyVersionId'],
          targetSources: [],
          suggestedActions: [{ action: 'correct-input', description: '补齐策略版本标识' }],
        }),
      ],
    };

    expect(backtestPreflightResultV3Schema.parse(ready)).toEqual(ready);
    expect(backtestPreflightResultV3Schema.parse(blocked)).toEqual(blocked);
    expect(backtestPreflightResultV3Schema.parse(invalidInput)).toEqual(invalidInput);
    expect(
      backtestPreflightResultV3Schema.safeParse({
        ...ready,
        diagnostics: [diagnostic()],
      }).success,
    ).toBe(false);
    expect(
      backtestPreflightResultV3Schema.safeParse({
        ...ready,
        revisionStamp: { ...revisionStamp, catalogRevision: null },
      }).success,
    ).toBe(false);
    expect(
      backtestPreflightResultV3Schema.safeParse({
        ...invalidInput,
        diagnostics: [diagnostic()],
      }).success,
    ).toBe(false);
  });
});
