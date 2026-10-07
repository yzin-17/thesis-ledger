import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  backtestExecutionModelSchemaV3,
  runConfigSchemaV3,
  strategySchema,
  type BacktestCalendarResponse,
  type BacktestCorporateActionsResponse,
  type BacktestInstrumentFactsResponse,
  type RunConfigV3,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { planBacktestDependencies } from '../../src/backtest/backtest-dependency-plan.js';
import {
  collectSnapshotDependenciesV3,
  SnapshotDependencyV3Error,
  validateSnapshotDependencyArtifactsV3,
  type SnapshotDependencyV3Input,
} from '../../src/backtest/backtest-snapshot-v3-dependencies.js';
import type { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { eventRevisions, snapshotEventDsaFixture } from './snapshot-event-dsa-v3.fixtures.js';
import { canonicalizeManifest } from '../../src/backtest/backtest-snapshot.js';

const modelFixture = backtestExecutionModelSchemaV3.parse(
  JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-execution-model.cn-2024q1.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as unknown,
);

const normalizedModel = () =>
  backtestExecutionModelSchemaV3.parse({
    ...modelFixture,
    segments: modelFixture.segments.map((segment) => {
      if (segment.execution.mode !== 'exchange') return segment;
      return {
        ...segment,
        execution: {
          ...segment.execution,
          price: { kind: 'noDailyLimit', reason: '价格已处于归一化连续坐标' },
          normalizedExecution: {
            priceCoordinate: 'continuous-decimal',
            quantityUnits: 'continuous-normalized-decimal',
            lotSizeConstraint: 'not-applied',
            tickSizeConstraint: 'not-applied',
            dailyPriceLimit: 'not-applied',
            feeBasis: 'simulatedTurnover',
          },
        },
      };
    }),
  });

const strategyValue = (overrides: Record<string, unknown> = {}): BacktestStrategy =>
  strategySchema.parse({
    schemaVersion: '2',
    name: 'snapshot dependency fixture',
    signalSources: [
      {
        id: 'close',
        asset: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
        timeframe: '1d',
        series: ['close'],
      },
    ],
    executionInstrument: { symbol: '600519.SH', market: 'CN', assetType: 'stock' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'close', field: 'close' },
      right: { type: 'constant', value: '0' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'percentOfEquity', percent: '1' },
    risk: [],
    execution: {
      mode: 'exchange',
      orderType: 'market',
      timeInForce: 'DAY',
      timing: 'nextEligibleBarOpen',
    },
    cost: { commissionRate: '0', slippageRate: '0' },
    ...overrides,
  }) as BacktestStrategy;

const runConfigValue = (
  options: { normalized?: boolean; baseCurrency?: 'CNY' | 'USD' } = {},
): RunConfigV3 => {
  const normalized = options.normalized ?? false;
  return runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: '2024-02-01',
    endDate: '2024-02-29',
    dataAsOf: '2024-03-04T16:00:00+08:00',
    baseCurrency: options.baseCurrency ?? 'CNY',
    initialCash: { [options.baseCurrency ?? 'CNY']: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    ...(normalized ? { executionModel: normalizedModel() } : {}),
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      accountingBasis: normalized ? 'normalized-series' : 'raw-events',
      priceBasis: {
        adjustment: normalized ? 'qfq' : 'none',
        method: 'provider-native',
        methodVersion: 'test-source-v1',
        basisScope: 'global',
        anchor: normalized ? '2024-02-01' : null,
        revision: { origin: 'provider', id: 'revision-1' },
        observedAt: '2024-03-01T12:00:00+08:00',
        volumeBasis: normalized ? 'split-adjusted' : 'original',
        dividendMeaning: normalized ? 'provider-defined' : 'explicit-cash',
        dividendEvidenceRef: null,
        conversionAvailable: normalized,
        conversionEvidenceRef: normalized ? 'conversion-evidence-1' : null,
        derivation: null,
        quantityBasis: normalized ? 'normalized-units' : 'actual-units',
      },
      history: normalized
        ? { basis: 'fixed-provider-snapshot' }
        : { basis: 'point-in-time', reconstructionEvidenceRef: 'reconstruction-1' },
    },
  }) as RunConfigV3;
};

const inputFor = (
  options: { normalized?: boolean; baseCurrency?: 'CNY' | 'USD'; strategy?: BacktestStrategy } = {},
): SnapshotDependencyV3Input => {
  const strategy = options.strategy ?? strategyValue();
  const runConfig = runConfigValue(options);
  return {
    strategy,
    runConfig,
    eventRevisions,
    plan: planBacktestDependencies({ strategy, runConfig }),
  };
};

const calendarResponse = (
  request: { start: string; end: string },
  options: {
    status?: BacktestCalendarResponse['status'];
    complete?: boolean;
    fact?: Partial<BacktestCalendarResponse['facts'][number]>;
  } = {},
): BacktestCalendarResponse => ({
  version: 3,
  status: options.status ?? 'supported',
  provider: 'fixture-calendar',
  providerRevision: 'calendar-r1',
  coverage: { start: request.start, end: request.end, complete: options.complete ?? true },
  facts: [
    {
      market: 'CN',
      timezone: 'Asia/Shanghai',
      provider: 'fixture-calendar',
      providerRevision: 'calendar-r1',
      availableAt: '2024-01-01T00:00:00Z',
      sessions: [{ startMinute: 570, endMinute: 690 }],
      sessionOverrides: [],
      holidays: [],
      range: { start: request.start, end: request.end },
      ...options.fact,
    },
  ],
});

const instrumentFactsResponse = (
  request: { start: string; end: string },
  options: {
    complete?: boolean;
    facts?: BacktestInstrumentFactsResponse['facts'];
  } = {},
): BacktestInstrumentFactsResponse => ({
  version: 3,
  status: 'supported',
  provider: 'fixture-instruments',
  providerRevision: 'instrument-envelope-r1',
  coverage: { start: request.start, end: request.end, complete: options.complete ?? true },
  facts: options.facts ?? [
    {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      currency: 'CNY',
      lotSize: '1',
      tickSize: '0.0001',
      tradable: true,
      executionRules: { status: 'unavailable', reason: '本任务不冻结实际交易规则' },
      provider: 'fixture-instruments',
      providerRevision: 'instrument-r1',
      occurredAt: '2024-01-01T00:00:00Z',
      availableAt: '2024-01-01T00:00:00Z',
    },
  ],
});

const dsaFixture = (
  options: {
    calendar?: Parameters<typeof calendarResponse>[1];
    instrumentFacts?: Parameters<typeof instrumentFactsResponse>[1];
    corporateActions?: Parameters<typeof snapshotEventDsaFixture>[0];
  } = {},
): Pick<
  DsaClient,
  'backtestCalendar' | 'backtestInstrumentFacts'
    | 'effectiveControlPolicyV3' | 'marketRouteCatalogV3' | 'marketEventsV3'
> => ({
  ...snapshotEventDsaFixture(options.corporateActions),
  backtestCalendar: vi.fn(async (request) => calendarResponse(request, options.calendar)),
  backtestInstrumentFacts: vi.fn(async (request) =>
    instrumentFactsResponse(request, options.instrumentFacts),
  ),
});

const expectDependencyError = async (
  promise: Promise<unknown>,
  reason: SnapshotDependencyV3Error['reason'],
) => {
  await expect(promise).rejects.toMatchObject({ code: 'DATA_UNAVAILABLE', reason });
};

describe('Snapshot V3 dependency artifacts', () => {
  it('冻结并校验登记日和发放日，保持策略可见性未知', async () => {
    const input = inputFor();
    const fact: BacktestCorporateActionsResponse['facts'][number] = {
      symbol: '600519.SH',
      market: 'CN',
      instrumentType: 'STOCK',
      type: 'CASH_DIVIDEND',
      cashAmount: '0.088',
      currency: 'CNY',
      effectiveDate: '2024-02-20',
      recordDate: '2024-02-19',
      paymentDate: '2024-02-27',
      occurredAt: '2024-02-20T00:00:00+08:00',
      availableAt: '2024-02-18T10:00:00+08:00',
      provider: 'fixture-actions',
      providerRevision: 'actions-r1',
    };
    const result = await collectSnapshotDependenciesV3(
      input,
      dsaFixture({ corporateActions: { facts: [fact] } }),
    );
    const rows = result.artifacts.find((item) => item.key.startsWith('corporateActions/'))!.rows;
    expect(rows).toEqual([fact]);
    expect(rows[0]).not.toHaveProperty('strategyVisibility');
    expect(() => validateSnapshotDependencyArtifactsV3(input, result.artifacts)).not.toThrow();
    const changed = result.artifacts.map((item) =>
      item.key.startsWith('corporateActions/')
        ? { ...item, rows: [{ ...item.rows[0], paymentDate: '2024-02-28' }] }
        : item,
    );
    expect(() => validateSnapshotDependencyArtifactsV3(input, changed)).toThrow();
  });

  it('freezes calendar, historical instrument facts, and a proven trusted-empty event response', async () => {
    const input = inputFor();
    const dsa = dsaFixture();
    const result = await collectSnapshotDependenciesV3(input, dsa);
    expect(dsa.marketEventsV3).toHaveBeenCalledTimes(2);

    expect(result.artifacts.map(({ key }) => key)).toEqual([
      'calendar/CN.parquet',
      'corporateActions/CN-600519.SH.parquet',
      'instrumentFacts/CN-600519.SH.parquet',
      'metadata/dependency-evidence-v3.parquet',
    ]);
    expect(result.artifacts.find(({ key }) => key.startsWith('corporateActions/'))?.rows).toEqual([
      { kind: 'empty-dataset', purpose: 'corporateActions', instrument: 'CN:600519.SH:stock' },
    ]);
    expect(result.corporateActionResponses['CN:600519.SH:stock']).toMatchObject({
      status: 'supported',
      coverage: { complete: true },
      facts: [],
    });
    expect(result.providerRevisions['calendar/CN.parquet']).toBe('calendar-r1');

    const proof = result.artifacts.find(
      ({ key }) => key === 'metadata/dependency-evidence-v3.parquet',
    )!;
    const actionProof = proof.rows.find((row) => row.purpose === 'corporateActions')!;
    expect(JSON.parse(actionProof.response as string)).toMatchObject({
      kind: 'snapshot-events-v3',
      exchanges: expect.arrayContaining([expect.objectContaining({ response: expect.objectContaining({
        coverage: { complete: true, admissionEvidenceRef: 'review-1' }, facts: [],
      }) })]),
    });
    expect(typeof actionProof.rowsFingerprint).toBe('string');
    expect(
      validateSnapshotDependencyArtifactsV3(input, result.artifacts).providerRevisions,
    ).toEqual(result.providerRevisions);
  });

  it('does not request corporate actions for a normalized strategy with no event dependency', async () => {
    const input = inputFor({ normalized: true });
    const dsa = dsaFixture();
    const result = await collectSnapshotDependenciesV3(input, dsa);

    expect(dsa.marketEventsV3).not.toHaveBeenCalled();
    expect(result.artifacts.map(({ key }) => key)).toEqual([
      'calendar/CN.parquet',
      'instrumentFacts/CN-600519.SH.parquet',
      'metadata/dependency-evidence-v3.parquet',
    ]);
    // Real lot/tick facts are kept as source evidence; normalized model assumptions own execution units.
    expect(
      result.artifacts.find(({ key }) => key.startsWith('instrumentFacts/'))?.rows[0],
    ).toMatchObject({
      lotSize: '1',
      tickSize: '0.0001',
      tradable: true,
    });
  });

  it('rejects unsupported or incomplete calendar coverage', async () => {
    const input = inputFor();
    await expectDependencyError(
      collectSnapshotDependenciesV3(input, dsaFixture({ calendar: { status: 'unavailable' } })),
      'response_unavailable',
    );
    await expectDependencyError(
      collectSnapshotDependenciesV3(input, dsaFixture({ calendar: { complete: false } })),
      'response_unavailable',
    );
  });

  it('rejects wrong instrument identity, future facts, and missing historical tradability', async () => {
    const input = inputFor();
    const wrongIdentity = instrumentFactsResponse({
      start: input.plan.warmup.startDate,
      end: input.runConfig.endDate,
    }).facts.map((fact) => ({ ...fact, symbol: '600000.SH' }));
    await expectDependencyError(
      collectSnapshotDependenciesV3(
        input,
        dsaFixture({ instrumentFacts: { facts: wrongIdentity } }),
      ),
      'response_scope_mismatch',
    );

    const futureFacts = instrumentFactsResponse({
      start: input.plan.warmup.startDate,
      end: input.runConfig.endDate,
    }).facts.map((fact) => ({ ...fact, availableAt: '2024-03-05T00:00:00Z' }));
    await expectDependencyError(
      collectSnapshotDependenciesV3(input, dsaFixture({ instrumentFacts: { facts: futureFacts } })),
      'future_fact',
    );

    const microsecondLateFacts = instrumentFactsResponse({
      start: input.plan.warmup.startDate,
      end: input.runConfig.endDate,
    }).facts.map((fact) => ({ ...fact, availableAt: '2024-03-04T08:00:00.000001Z' }));
    await expectDependencyError(
      collectSnapshotDependenciesV3(
        input,
        dsaFixture({ instrumentFacts: { facts: microsecondLateFacts } }),
      ),
      'future_fact',
    );

    const untradableFacts = instrumentFactsResponse({
      start: input.plan.warmup.startDate,
      end: input.runConfig.endDate,
    }).facts.map((fact) => ({ ...fact, tradable: false }));
    await expectDependencyError(
      collectSnapshotDependenciesV3(
        input,
        dsaFixture({ instrumentFacts: { facts: untradableFacts } }),
      ),
      'fact_unavailable',
    );
    await expectDependencyError(
      collectSnapshotDependenciesV3(input, dsaFixture({ instrumentFacts: { facts: [] } })),
      'fact_unavailable',
    );
  });

  it('binds instrument facts to an execution model scope without substituting physical lot rules', async () => {
    const input = inputFor({ normalized: true });
    const correct = dsaFixture();
    const result = await collectSnapshotDependenciesV3(input, correct);
    expect(
      result.artifacts.find(({ key }) => key.startsWith('instrumentFacts/'))?.rows[0],
    ).toMatchObject({
      lotSize: '1',
      tickSize: '0.0001',
      tradable: true,
    });

    const mismatchModel = {
      ...normalizedModel(),
      scope: { ...normalizedModel().scope, symbol: '600000.SH' },
    };
    const mismatchedInput = {
      ...input,
      runConfig: runConfigSchemaV3.parse({ ...input.runConfig, executionModel: mismatchModel }),
    };
    mismatchedInput.plan = planBacktestDependencies({
      strategy: mismatchedInput.strategy,
      runConfig: mismatchedInput.runConfig,
    });
    await expectDependencyError(
      collectSnapshotDependenciesV3(mismatchedInput, dsaFixture()),
      'model_scope_mismatch',
    );
  });

  it('rejects unimplemented FX and NAV dependencies explicitly', async () => {
    const fxInput = inputFor({ baseCurrency: 'USD' });
    await expectDependencyError(
      collectSnapshotDependenciesV3(fxInput, dsaFixture()),
      'unsupported_dependency',
    );

    const navStrategy = strategyValue({
      executionInstrument: { symbol: 'FUND.CN', market: 'CN', assetType: 'fund' },
      signalSources: [
        {
          id: 'close',
          asset: { symbol: 'FUND.CN', market: 'CN', assetType: 'fund' },
          timeframe: '1d',
          series: ['nav'],
        },
      ],
      entry: {
        type: 'compare',
        operator: 'gt',
        left: { type: 'series', sourceId: 'close', field: 'nav' },
        right: { type: 'constant', value: '0' },
      },
      execution: { mode: 'nav', requestTypes: ['subscribe'], timing: 'nextAvailableNav' },
    });
    const navInput = inputFor({ strategy: navStrategy });
    await expectDependencyError(
      collectSnapshotDependenciesV3(navInput, dsaFixture()),
      'unsupported_dependency',
    );
  });

  it('rejects tampered fact rows and altered coverage proof during offline validation', async () => {
    const input = inputFor();
    const result = await collectSnapshotDependenciesV3(input, dsaFixture());
    const instrumentKey = 'instrumentFacts/CN-600519.SH.parquet';
    const changedRows = result.artifacts.map((artifact) =>
      artifact.key === instrumentKey
        ? {
            ...artifact,
            rows: [{ ...artifact.rows[0]!, tradable: false }],
          }
        : artifact,
    );
    expect(() => validateSnapshotDependencyArtifactsV3(input, changedRows)).toThrow(
      SnapshotDependencyV3Error,
    );

    const changedProof = result.artifacts.map((artifact) =>
      artifact.key === 'metadata/dependency-evidence-v3.parquet'
        ? {
            ...artifact,
            rows: artifact.rows.map((row) =>
              row.purpose === 'calendar' ? { ...row, providerRevision: 'changed' } : row,
            ),
          }
        : artifact,
    );
    expect(() => validateSnapshotDependencyArtifactsV3(input, changedProof)).toThrow(
      SnapshotDependencyV3Error,
    );
  });

  it('拒绝不完整事件和缺少冻结版本，不回退 V2', async () => {
    const input = inputFor();
    const dsa = dsaFixture({ corporateActions: { complete: false } });
    await expectDependencyError(collectSnapshotDependenciesV3(input, dsa), 'event_plan_blocked');
    const missing = inputFor();
    delete missing.eventRevisions;
    const other = dsaFixture();
    await expectDependencyError(collectSnapshotDependenciesV3(missing, other), 'event_plan_blocked');
    expect(other.marketEventsV3).not.toHaveBeenCalled();
  });

  it('离线拒绝事件能力缺失和冻结行情版本错配', async () => {
    const input = inputFor();
    const result = await collectSnapshotDependenciesV3(input, dsaFixture());
    expect(() => validateSnapshotDependencyArtifactsV3({
      ...input, eventRevisions: { ...eventRevisions, catalogRevision: 9 },
    }, result.artifacts)).toThrow(SnapshotDependencyV3Error);
    const changed = result.artifacts.map((artifact) => ({ ...artifact,
      rows: artifact.rows.map((row) => {
        if (row.purpose !== 'corporateActions' || typeof row.response !== 'string') return row;
        const bundle = JSON.parse(row.response) as { kind: string; exchanges: unknown[] };
        bundle.exchanges.pop();
        return { ...row, response: canonicalizeManifest(bundle) };
      }),
    }));
    expect(() => validateSnapshotDependencyArtifactsV3(input, changed)).toThrow(SnapshotDependencyV3Error);
  });
});
