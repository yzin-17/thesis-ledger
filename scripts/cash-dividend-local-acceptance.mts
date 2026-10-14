import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  marketDataBarSeriesResponseV3Schema,
  runConfigSchemaV3,
  strategySchema,
  backtestExecutionModelSchemaV3,
  marketEventResponseV3Schema,
  backtestRunPreparationRequestV3Schema,
  type MarketEventRequestV3,
  type BacktestCalendarRequest,
  type BacktestInstrumentFactsRequest,
} from '../packages/schemas/src/index.js';
import {
  LocalSnapshotStore,
  hashCanonicalManifest,
} from '../apps/server/src/backtest/backtest-snapshot.js';
import { buildBacktestSnapshotV3 } from '../apps/server/src/backtest/backtest-snapshot-v3-builder.js';
import { LocalSnapshotV3Runner } from '../apps/server/src/backtest/backtest-v3-runner.js';
import { marketFrozenWindowHashV3 } from '../apps/server/src/market/market-frozen-window-v3.js';
import { prepareBacktestRunConfigV3 } from '../apps/server/src/backtest/backtest-run-preparation.js';
import type { MarketBarWindowReadInputV3 } from '../apps/server/src/market/market-bar-reader-v3.js';
import type { DsaClient } from '../apps/server/src/integration/dsa/dsa.client.js';

// 本机受控验收：原始价格与公告是真实捕获输入；控制面为本地 wrapper，不能作为目标准入证明。
const root = resolve(import.meta.dirname, '..');
const dsaRoot = resolve(root, '../daily-stock-analysis');
const capturedPath = resolve(
  root,
  '.recovery-artifacts/research-feasibility-2026-10-06/510300_2023_none.json',
);
const output = resolve(root, '.recovery-artifacts/m31-2026-10-07/local-cash-snapshot');
const clock = new Date().toISOString();
const strategyVersionId = randomUUID();
const source = (mode: string, start: string, end: string) =>
  JSON.parse(
    execFileSync(
      resolve(dsaRoot, '.venv/bin/python'),
      [
        resolve(root, 'scripts/cash-dividend-captured-input.py'),
        mode,
        clock,
        start,
        end,
        capturedPath,
      ],
      { cwd: dsaRoot, env: { ...process.env, PYTHONPATH: dsaRoot }, maxBuffer: 2_000_000 },
    ).toString(),
  );
const fixture = async (name: string) =>
  JSON.parse(await readFile(resolve(root, `packages/schemas/fixtures/${name}`), 'utf8'));
const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'ETF',
  capability: 'CASH_DISTRIBUTION',
} as const;
const target = { providerId: 'official-dividends', upstreamSource: 'cn-etf-cash-notices' };
await mkdir(output, { recursive: true });
const samples = [];
for (const { analysisStart, end } of [
  { analysisStart: '2023-01-05', end: '2023-01-18' },
  { analysisStart: '2023-01-05', end: '2023-02-01' },
  { analysisStart: '2023-01-12', end: '2023-02-01' },
]) {
  const range = { start: analysisStart === '2023-01-05' ? '2023-01-03' : '2023-01-10', end };
  const sampleKey = analysisStart === '2023-01-05' ? end : `${analysisStart}--${end}`;
  const rawStrategy = await fixture('backtest-v2.exchange.json');
  rawStrategy.name = '510300 原始价格与现金分红持有验收';
  rawStrategy.executionInstrument = { symbol: '510300.SH', market: 'CN', assetType: 'etf' };
  rawStrategy.signalSources = [
    { id: 'execution', asset: rawStrategy.executionInstrument, timeframe: '1d', series: ['close'] },
  ];
  const close = { type: 'series', sourceId: 'execution', field: 'close' };
  rawStrategy.entry = {
    type: 'compare',
    operator: 'gt',
    left: close,
    right: { type: 'constant', value: '0' },
  };
  rawStrategy.exit = {
    type: 'compare',
    operator: 'lt',
    left: close,
    right: { type: 'constant', value: '0' },
  };
  rawStrategy.risk = [];
  rawStrategy.sizing = { type: 'fixedAmount', amount: '50000' };
  rawStrategy.cost = { commissionRate: '0', slippageRate: '0' };
  const strategy = strategySchema.parse(rawStrategy);
  const rawModel = await fixture('backtest-execution-model.cn-2024q1.json');
  rawModel.id = `510300-cash-research-${end}`;
  const analysisRange = { start: analysisStart, end };
  rawModel.scope = {
    ...rawModel.scope,
    symbol: '510300.SH',
    instrumentType: 'ETF',
    range: analysisRange,
  };
  const segment = rawModel.segments[0];
  segment.range = analysisRange;
  segment.source = {
    kind: 'userConfiguration',
    revision: '1',
    configuredAt: clock,
    description: '有界现金分红验收使用真实单位、零收费、零滑点和无日涨跌幅限制的显式研究模型',
    references: ['docs/tasks/2026-10-03-multi-source-remaining-acceptance.md'],
  };
  segment.assumptions = [
    '真实 ETF 单位与整手价位约束；所有收费为零的显式研究假设',
    '现金权益于除息日确认，发放日转为可用现金；拆分事件未建模',
  ];
  segment.fees.commission.rate = '0';
  segment.fees.commission.minimum = { kind: 'none' };
  for (const charge of ['stampDuty', 'transferFee', 'regulatoryFee', 'handlingFee'])
    segment.fees[charge] = {
      treatment: 'notApplicable',
      reason: '本现金入账验收显式假设不收取该项',
    };
  segment.execution.price = { kind: 'noDailyLimit', reason: '本现金入账研究不模拟日涨跌幅限制' };
  const executionModel = backtestExecutionModelSchemaV3.parse(rawModel);
  const observed = source('bars', range.start, range.end);
  const template = await fixture('market-data-v3.response.etf-qfq.json');
  const basis = {
    ...template.sourcePriceBasis,
    adjustment: 'none',
    methodVersion: 'tencent-captured-raw-v1',
    revision: { origin: 'local-observation', contentHash: observed.metadata.sha256 },
    observedAt: observed.metadata.fetchedAt,
  };
  const bars = observed.rows.map((row: string[]) => ({
    timestamp: `${row[0]}T07:00:00.000Z`,
    open: Number(row[1]),
    close: Number(row[2]),
    high: Number(row[3]),
    low: Number(row[4]),
    volume: Number(row[5]),
    amount: Number(row[8]),
    completionStatus: 'complete',
    availableAt: observed.metadata.fetchedAt,
  }));
  const routeKey = {
    kind: 'bar',
    market: 'CN',
    assetType: 'ETF',
    capability: 'DAILY_BAR',
    timeframe: '1d',
    adjustment: 'none',
  } as const;
  const response = marketDataBarSeriesResponseV3Schema.parse({
    contractVersion: 3,
    requestId: `local-cash-bars-${end}`,
    symbol: '510300.SH',
    routeKey,
    bars,
    coverage: {
      requestedStart: range.start,
      requestedEnd: range.end,
      actualStart: bars[0].timestamp,
      actualEnd: bars.at(-1).timestamp,
      hasMoreBefore: false,
      latestCompleteTradingDate: observed.rows.at(-1)[0],
    },
    coverageProof: {
      calendar: observed.context.calendar,
      listing: observed.context.listing,
      window: { status: 'complete', requestedStart: range.start, requestedEnd: range.end },
      pagination: { status: 'complete', pagesFetched: 1, continuationPending: false },
    },
    sourcePriceBasis: basis,
    provenance: {
      providerId: 'tencent',
      upstreamSource: 'tencent',
      routeIndex: 0,
      effectivePolicyRevision: 1,
    },
    inputFingerprint: hashCanonicalManifest({ raw: observed.metadata.sha256, range }),
    historicalTradabilityWindows: observed.historicalTradabilityWindows,
  });
  const responseHash = marketFrozenWindowHashV3(response);
  const identityFingerprint = hashCanonicalManifest({ symbol: response.symbol, routeKey, range });
  let runConfig = runConfigSchemaV3.parse({
    schemaVersion: '3',
    startDate: analysisRange.start,
    endDate: end,
    dataAsOf: clock,
    baseCurrency: 'CNY',
    initialCash: { CNY: '100000' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '15:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
    priceInputBindings: {
      signals: [{ sourceId: 'execution', binding: 'execution-series' }],
      benchmark: { binding: 'execution-series' },
    },
    executionPriceProtocol: {
      protocolVersion: 'execution-price-v1',
      priceBasis: { ...basis, quantityBasis: 'actual-units' },
      accountingBasis: 'raw-events',
      history: { basis: 'fixed-provider-snapshot' },
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
    },
    executionModel,
    frozenExecutionWindow: {
      version: 'market-frozen-window-v1',
      identityFingerprint,
      responseHash,
    },
    frozenWarmupBudgetSessions: 1,
  });
  const dsa = {
    backtestCalendar: async (request: BacktestCalendarRequest) => {
      const fact = source('calendar', request.start, request.end);
      return {
        version: 3,
        status: 'supported',
        provider: fact.provider,
        providerRevision: fact.providerRevision,
        coverage: { start: request.start, end: request.end, complete: true },
        facts: [fact],
      };
    },
    backtestInstrumentFacts: async (request: BacktestInstrumentFactsRequest) => {
      return source('instrument', request.start, request.end);
    },
    effectiveControlPolicyV3: async () => ({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      projection: {
        effective: {
          contractVersion: 3,
          consumer: 'thesis-ledger',
          requestId: 'local-controlled-policy',
          revision: 1,
          sourceDesiredRevision: 1,
          enabled: true,
          appliedAt: clock,
          routes: [
            {
              key,
              reason: null,
              targets: [{ ...target, routeIndex: 0, eligible: true, reason: null }],
            },
          ],
        },
      },
    }),
    marketRouteCatalogV3: async () => ({
      contractVersion: 3,
      consumer: 'thesis-ledger',
      catalogRevision: 1,
      generatedAt: clock,
      integrity: 'complete',
      entries: [{ key, target, state: 'ready' }],
    }),
    marketEventsV3: async (request: MarketEventRequestV3) => {
      const notice = source('notice', request.start, request.end);
      const evidence = notice.noticeDividendEvidence;
      return marketEventResponseV3Schema.parse({
        ...request,
        fetchedAt: new Date().toISOString(),
        providerRevision: notice.provenance.providerRevision,
        facts: notice.facts,
        noticeDividendEvidence: evidence,
        coverage: { complete: true, admissionEvidenceRef: evidence.ref },
        admission: {
          consumer: 'thesis-ledger',
          routeKey: key,
          target,
          status: 'admitted',
          admissionState: 'admitted',
          evidenceRef: evidence.ref,
          evidenceSha256: evidence.sha256,
          scopeSymbols: ['510300.SH'],
          scopeDateFrom: '2023-01-03',
          scopeDateTo: '2023-02-01',
          adapterRevision: 'official-cash-notices-v1',
          sourceRevision: notice.provenance.providerRevision,
          credentialRevision: 'not-required',
          validFrom: clock,
          validUntil: '2027-01-01T00:00:00Z',
          recordedAt: clock,
          recordVersion: 1,
          invalidatedAt: null,
          invalidationReason: null,
        },
      });
    },
  } as unknown as DsaClient;
  const reader = {
    readV3: async (input: MarketBarWindowReadInputV3) => {
      assert.deepEqual(input.window, range);
      return {
        status: 'selected' as const,
        request: {
          contractVersion: 3 as const,
          requestId: response.requestId,
          symbol: response.symbol,
          routeKey,
          routeTarget: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 },
          start: range.start,
          end: end,
          tradabilityMode: 'assume-untradable-no-bar' as const,
        },
        seriesVersion: response.inputFingerprint,
        frozenWindowRef: runConfig.frozenExecutionWindow,
        evidence: {
          identityFingerprint,
          completeResponseHash: responseHash,
          routeKey,
          target: { providerId: 'tencent', upstreamSource: 'tencent', routeIndex: 0 },
          symbol: response.symbol,
          window: range,
          seriesVersion: response.inputFingerprint,
          inputFingerprint: response.inputFingerprint,
          desiredRevision: 1,
          effectivePolicyRevision: 1,
          catalogRevision: 1,
          sourcePriceBasis: response.sourcePriceBasis,
          coverageProof: response.coverageProof,
          fetchedAt: new Date(clock),
        },
        selection: {
          status: 'selected' as const,
          source: 'primary' as const,
          response,
          target: { providerId: 'tencent', upstreamSource: 'tencent' },
          routeIndex: 0,
          desiredRevision: 1,
          effectivePolicyRevision: 1,
          catalogRevision: 1,
        },
      };
    },
  };
  const prepared = await prepareBacktestRunConfigV3({
    strategy,
    reader,
    checkedAt: clock,
    control: {
      getPolicy: async () => ({
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'local-controlled-policy',
        revision: 1,
        enabled: true,
        syncState: 'applied',
        effectiveStale: false,
        routes: [
          { key: routeKey, targets: [{ providerId: 'tencent', upstreamSource: 'tencent' }] },
        ],
      }),
    } as never,
    request: backtestRunPreparationRequestV3Schema.parse({
      contractVersion: 3,
      requestId: `cash-prepare-${end}`,
      strategyVersionId,
      adjustment: 'none',
      accountingBasis: 'raw-events',
      history: { basis: 'fixed-provider-snapshot' },
      cashEventResearch: 'ex-date-entitlement-payment-date-cash-v1',
      warmupBudgetSessions: 1,
      freezeTimePolicy: 'after-acquisition',
      runConfig: {
        startDate: runConfig.startDate,
        endDate: end,
        dataAsOf: clock,
        baseCurrency: 'CNY',
        initialCash: runConfig.initialCash,
        valuationPolicy: runConfig.valuationPolicy,
        executionModel,
      },
    }),
  });
  assert.equal(prepared.status, 'prepared', JSON.stringify(prepared));
  if (prepared.status !== 'prepared') throw new Error('本机标准准备未通过');
  runConfig = prepared.runConfig;
  const runId = `cash-${sampleKey}-${clock.replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const store = new LocalSnapshotStore(output);
  const built = await buildBacktestSnapshotV3(
    {
      runId,
      strategyVersionId,
      strategyVersionHash: hashCanonicalManifest(strategy),
      strategy,
      runConfig,
      executionRouteKey: routeKey,
      preparationStamp: prepared.executionPreflight.revisionStamp,
    },
    store.v3,
    reader,
    dsa,
  );
  const runnerInput = { runId, snapshotRef: built.snapshotRef, artifactRefs: built.artifactRefs };
  const first = await new LocalSnapshotV3Runner(store).run(
    runnerInput,
    new AbortController().signal,
  );
  const second = await new LocalSnapshotV3Runner(new LocalSnapshotStore(output)).run(
    runnerInput,
    new AbortController().signal,
  );
  assert.equal(first.resultChecksum, second.resultChecksum);
  assert.deepEqual(first, second);
  await writeFile(
    resolve(output, `${sampleKey}-result.json`),
    JSON.stringify(
      {
        controlledSourceAdmission: true,
        capturedPriceSha256: observed.metadata.sha256,
        runConfig,
        manifest: built.manifest,
        result: first,
      },
      null,
      2,
    ),
  );
  assert.equal(first.cashDividendDisclosure?.records.length, 1);
  const record = first.cashDividendDisclosure.records[0];
  assert.equal(record.status, end === '2023-01-18' ? 'receivable' : 'paid');
  assert.equal(first.metrics.totalReturn.status, 'available');
  assert.equal(first.benchmarkCompatibility.status, 'unverified');
  assert.equal(first.benchmark.totalReturn.status, 'unavailable');
  assert.equal(first.completeness, 'partial');
  const independent = JSON.parse(
    execFileSync(
      resolve(dsaRoot, '.venv/bin/python'),
      [
        resolve(root, 'scripts/cash-dividend-captured-input.py'),
        'verify',
        clock,
        range.start,
        end,
        capturedPath,
        resolve(output, `${sampleKey}-result.json`),
      ],
      { cwd: dsaRoot, env: { ...process.env, PYTHONPATH: dsaRoot }, maxBuffer: 20_000 },
    ).toString(),
  );
  samples.push({
    analysisStart,
    end,
    runId,
    snapshotId: built.snapshotRef.snapshotId,
    checksum: first.resultChecksum,
    record,
    metrics: first.metrics,
    independent,
    replayMatches: true,
  });
}
console.log(
  JSON.stringify(
    {
      evidenceBoundary: '本机受控输入验证；尚未证明目标准入、数据库终态或浏览器消费',
      output,
      samples,
    },
    null,
    2,
  ),
);
