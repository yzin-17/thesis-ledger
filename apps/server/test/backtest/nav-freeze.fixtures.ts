import { readFileSync } from 'node:fs';
import {
  backtestNavRunConfigV3Schema,
  strategySchema,
  type BacktestStrategy,
} from '@thesis-ledger/schemas';
import { hashNavRaw } from '../../src/backtest/backtest-nav-freeze-validation.js';
import type { NavSnapshotFreezeInput } from '../../src/backtest/backtest-nav-snapshot-store.js';
import { canonicalizeManifest } from '../../src/backtest/backtest-snapshot.js';

export const navFreezeFixture = (runId = 'nav-run'): NavSnapshotFreezeInput => {
  const symbol = '110011.OF';
  const executionModel = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/backtest-execution-model.nav-fund.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  executionModel.scope.symbol = symbol;
  const runConfig = backtestNavRunConfigV3Schema.parse({
    schemaVersion: '3',
    startDate: '2026-09-08',
    endDate: '2026-09-15',
    dataAsOf: '2026-09-30T00:00:00.000001Z',
    baseCurrency: 'CNY',
    initialCash: { CNY: '10000' },
    executionModel,
    navInput: { kind: 'nav', symbol },
    navVisibility: { mode: 'strict-publication' },
    valuationPolicy: {
      baseTimezone: 'Asia/Shanghai',
      dailyValuationTime: '20:00',
      pricePolicy: 'latestAvailable',
      fxPolicy: 'latestAvailable',
    },
  });
  const strategy = strategySchema.parse({
    schemaVersion: '2',
    name: 'NAV 冻结测试',
    signalSources: [
      {
        id: 'nav',
        asset: { symbol, market: 'CN', assetType: 'fund' },
        timeframe: '1d',
        series: ['nav'],
      },
    ],
    executionInstrument: { symbol, market: 'CN', assetType: 'fund' },
    primaryTimeframe: '1d',
    entry: {
      type: 'compare',
      operator: 'gt',
      left: { type: 'series', sourceId: 'nav', field: 'nav' },
      right: { type: 'constant', value: '1' },
    },
    exit: { type: 'positionState', field: 'isOpen' },
    sizing: { type: 'fixedQuantity', quantity: '1' },
    risk: [],
    execution: { mode: 'nav', requestTypes: ['subscribe', 'redeem'], timing: 'nextAvailableNav' },
    cost: { commissionRate: '0', slippageRate: '0' },
  }) as BacktestStrategy;
  const dates = [
    '2026-09-07',
    '2026-09-08',
    '2026-09-09',
    '2026-09-10',
    '2026-09-11',
    '2026-09-14',
    '2026-09-15',
  ];
  const payload = {
    symbol,
    market: 'CN' as const,
    timezone: 'Asia/Shanghai' as const,
    version: 'fixture-calendar-v1',
    coverage: { startDate: '2026-09-07', endDate: '2026-09-21', complete: true as const },
    valuationDates: dates,
    tradingDates: [...dates, '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21'],
    disclosureWorkDates: [...dates, '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-21'],
  };
  const calendarRaw = canonicalizeManifest(payload);
  const records = dates.map((valuationDate) => ({
    sourceRecordId: `fixture:${valuationDate}`,
    symbol,
    valuationDate,
    nav: '1.25',
    sourcePublishedAt: `${valuationDate}T12:00:00Z`,
    nativeField: '保留的来源原字段',
  }));
  const responseRaw = JSON.stringify({ records });
  const publicationRecords = records.map((record) => ({
    sourceRecordId: record.sourceRecordId,
    rawRecord: JSON.stringify(record),
  }));
  const facts = records.map((record, index) => ({
    symbol,
    valuationDate: record.valuationDate,
    nav: record.nav,
    status: 'supported' as const,
    freshness: 'delayed' as const,
    quality: 'complete' as const,
    occurredAt: `${record.valuationDate}T07:00:00Z`,
    availableAt: record.sourcePublishedAt,
    publicationEvidence: {
      kind: 'source-publication-record' as const,
      sourceRecordId: record.sourceRecordId,
      sourcePublishedAt: record.sourcePublishedAt,
      rawRecordHash: hashNavRaw(publicationRecords[index]!.rawRecord),
      evidenceRef: `fixture://publication/${record.valuationDate}`,
    },
  }));
  return {
    runId,
    strategyVersionId: 'nav-strategy',
    facts,
    source: {
      routeKey: {
        kind: 'data',
        market: 'CN',
        assetType: 'MUTUAL_FUND',
        capability: 'FUND_NAV_HISTORY',
      },
      target: { providerId: 'fixture', upstreamSource: 'fixture-publication-record' },
      policyRevision: 1,
      adapterRevision: 'fixture-adapter-v1',
      providerRevision: 'fixture-provider-v1',
      sourceRevision: 'fixture-source-v1',
      credentialRevision: null,
      responseHash: hashNavRaw(responseRaw),
      capturedAt: '2026-09-29T00:00:00Z',
    },
    context: {
      strategy,
      runConfig,
      calendar: {
        ...payload,
        availableAt: '2026-09-01T00:00:00Z',
        evidenceRef: 'fixture://calendar/raw',
        contentHash: hashNavRaw(calendarRaw),
      },
      calendarRaw,
      responseRaw,
      ruleRaw: null,
      publicationRecords,
    },
  };
};
