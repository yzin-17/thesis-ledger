import { readFileSync } from 'node:fs';
import type { Prisma } from '@prisma/client';
import { vi } from 'vitest';
import {
  backtestCalendarResponseSchema,
  backtestInstrumentFactsResponseSchema,
  backtestRunPreparationRequestV3Schema,
  marketDataBarSeriesRequestResponseV3Schema,
} from '@thesis-ledger/schemas';
import { BacktestRunPreparationService } from '../../src/backtest/backtest-run-preparation.service.js';
import { MarketBarWindowReaderV3 } from '../../src/market/market-bar-reader-v3.js';
import { MarketFrozenWindowReaderV3 } from '../../src/market/market-frozen-window-reader-v3.js';
import { MarketRouteRevisionService } from '../../src/market/market-route-revision.service.js';
import { MarketWindowEvidenceV3Repository } from '../../src/market/market-window-evidence-v3.repository.js';
import { decodeMarketWindowEvidenceInsert } from '../market/market-window-evidence-v3-sql-mock.js';
import { completeSnapshotFixture } from './v3-complete-snapshot-fixtures.js';

const evidenceJson = (name: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../../docs/tasks/evidence/${name}`, import.meta.url), 'utf8'),
  ) as Record<string, unknown>;

export async function capturedResearchFixture(symbol: string) {
  const saved = evidenceJson('2026-10-06-research-listing-c22b2a-input.json');
  const samples = saved.samples as unknown[];
  const sample = samples
    .map((value) => marketDataBarSeriesRequestResponseV3Schema.parse(value))
    .find((value) => value.request.symbol === symbol);
  if (!sample) throw new Error('保存行情缺少指定标的');
  const dependencies = evidenceJson('2026-10-06-research-prepare-c22b2b-dependencies.json');
  const calendar = backtestCalendarResponseSchema.parse(dependencies.calendar);
  const instruments = dependencies.instruments as Record<string, unknown>;
  const instrument = backtestInstrumentFactsResponseSchema.parse(instruments[symbol]);
  const feeErrors = dependencies.feeErrors as Array<{
    symbol: string;
    routeTarget: { providerId: string; upstreamSource: string; routeIndex: number };
    code: string;
    message: string;
  }>;
  const { input } = await completeSnapshotFixture();
  input.strategy.executionInstrument = { symbol, market: 'CN', assetType: 'stock' };
  for (const source of input.strategy.signalSources)
    source.asset = input.strategy.executionInstrument;
  const model = structuredClone(input.runConfig.executionModel!);
  model.scope = {
    ...model.scope,
    symbol,
    instrumentType: 'STOCK',
    range: { start: '2023-08-01', end: '2023-09-15' },
  };
  for (const segment of model.segments) segment.range = model.scope.range;
  const request = backtestRunPreparationRequestV3Schema.parse({
    contractVersion: 3,
    requestId: `captured-prepare-${symbol}`,
    strategyVersionId: '11111111-1111-4111-8111-111111111111',
    adjustment: 'qfq',
    accountingBasis: 'normalized-series',
    history: { basis: 'fixed-provider-snapshot' },
    warmupBudgetSessions: 5,
    freezeTimePolicy: 'after-acquisition',
    runConfig: {
      startDate: '2023-08-01',
      endDate: '2023-09-15',
      dataAsOf: sample.response.sourcePriceBasis.observedAt,
      baseCurrency: 'CNY',
      initialCash: { CNY: '1000000' },
      valuationPolicy: input.runConfig.valuationPolicy,
      executionModel: model,
    },
  });
  const { routeKey } = sample.request;
  const target = sample.request.routeTarget!;
  const feeKey = {
    kind: 'data',
    market: 'CN',
    assetType: 'STOCK',
    capability: 'HISTORICAL_PUBLIC_FEES',
  };
  const feeTargets = feeErrors
    .filter((error) => error.symbol === symbol)
    .map((error) => error.routeTarget);
  const desired = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId: 'captured-policy',
    revision: 7,
    enabled: true,
    routes: [
      {
        key: routeKey,
        targets: [{ providerId: target.providerId, upstreamSource: target.upstreamSource }],
      },
    ],
  };
  const effective = {
    ...desired,
    revision: sample.response.provenance.effectivePolicyRevision,
    sourceDesiredRevision: 7,
    appliedAt: sample.response.sourcePriceBasis.observedAt,
    routes: [
      { key: routeKey, targets: [{ ...target, eligible: true, reason: null }], reason: null },
      {
        key: feeKey,
        targets: feeTargets.map((value) => ({ ...value, eligible: true, reason: null })),
        reason: null,
      },
    ],
  };
  const control = {
    getPolicy: vi.fn(async () => ({ ...desired, syncState: 'applied', effectiveStale: false })),
  };
  const dsa = {
    effectiveControlPolicyV3: vi.fn(async () => ({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      projection: { effective },
    })),
    marketRouteCatalogV3: vi.fn(async () => ({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      catalogRevision: 12,
      generatedAt: sample.response.sourcePriceBasis.observedAt,
      integrity: 'complete',
      entries: [
        {
          key: routeKey,
          target: { providerId: target.providerId, upstreamSource: target.upstreamSource },
          state: 'ready',
        },
      ],
    })),
    marketDataCapabilitiesV3: vi.fn(async () => ({
      dataContractVersions: [3],
      serviceCapabilities: { fundNav: true },
    })),
    marketBarsV3: vi.fn(
      async (value: { requestId: string; symbol: string; start: string; end: string }) => {
        if (
          value.symbol !== symbol ||
          value.start !== sample.request.start ||
          value.end !== sample.request.end
        )
          throw new Error('保存行情仅覆盖 C1 原始请求，不创建其他行情');
        return { ...structuredClone(sample.response), requestId: value.requestId };
      },
    ),
    backtestCalendar: vi.fn(async (value: { start: string; end: string }) => {
      const fact = calendar.facts[0]!;
      if (
        !fact.range.start ||
        !fact.range.end ||
        value.start < fact.range.start ||
        value.end > fact.range.end
      )
        throw new Error('保存日历不足');
      return {
        ...structuredClone(calendar),
        coverage: { ...calendar.coverage, start: value.start, end: value.end },
      };
    }),
    backtestInstrumentFacts: vi.fn(
      async (value: { symbol: string; start: string; end: string; identityOnly?: boolean }) => {
        if (value.symbol !== symbol || !value.identityOnly)
          throw new Error('需使用冻结日级信息绑定标的事实');
        return {
          ...structuredClone(instrument),
          coverage: { ...instrument.coverage, start: value.start, end: value.end },
        };
      },
    ),
    marketPublicFeesV3: vi.fn(
      async (value: { symbol: string; routeTarget: { upstreamSource: string } }) => {
        const failure = feeErrors.find(
          (error) =>
            error.symbol === value.symbol &&
            error.routeTarget.upstreamSource === value.routeTarget.upstreamSource,
        );
        if (!failure) throw new Error('未登记收费来源');
        throw Object.assign(new Error(failure.message), { code: failure.code });
      },
    ),
  };
  const rows = new Map<string, Record<string, unknown>>();
  const prisma = {
    strategyVersion: {
      findUnique: vi.fn(async () => ({ schemaVersion: 2, schema: input.strategy })),
    },
    backtestJob: { create: vi.fn() },
    marketBarWindowEvidenceV3: {
      findUnique: vi.fn(
        async ({ where }: { where: { identityFingerprint: string } }) =>
          rows.get(where.identityFingerprint) ?? null,
      ),
    },
    $queryRaw: vi.fn(async (statement: Prisma.Sql) => {
      const value = decodeMarketWindowEvidenceInsert(statement);
      const id = String(value.identityFingerprint);
      if (rows.has(id)) return [];
      rows.set(id, value);
      return [value];
    }),
  };
  const repository = new MarketWindowEvidenceV3Repository(prisma as never);
  const revisions = new MarketRouteRevisionService(control as never, dsa as never);
  const frozenReader = new MarketFrozenWindowReaderV3(repository, revisions);
  const windowReader = new MarketBarWindowReaderV3(
    control as never,
    dsa as never,
    repository,
    frozenReader,
  );
  const reader = { readV3: vi.fn(windowReader.read.bind(windowReader)) };
  const service = new BacktestRunPreparationService(
    prisma as never,
    reader as never,
    control as never,
  );
  return { input, sample, request, service, reader, repository, dsa, prisma, rows, control };
}
