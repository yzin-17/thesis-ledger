import { describe, expect, it } from 'vitest';
import {
  backtestNavSourceRequestV3Schema,
  backtestNavSourceResponseV3Schema,
} from '../src/index.js';

const key = {
  kind: 'data',
  market: 'CN',
  assetType: 'MUTUAL_FUND',
  capability: 'FUND_NAV_HISTORY',
};
const target = { providerId: 'efinance', upstreamSource: 'eastmoney' };
const identity = {
  contractVersion: 3,
  requestId: 'nav',
  symbol: '161725.OF',
  routeKey: key,
  routeTarget: { ...target, routeIndex: 0 },
  desiredRevision: 1,
  effectivePolicyRevision: 1,
  catalogRevision: 1,
  dataAsOf: '2026-10-01T00:00:00Z',
};
const hash = 'a'.repeat(64);
const request = () => ({
  ...identity,
  fundType: 'domestic',
  start: '2026-09-08',
  end: '2026-09-15',
  warmupPeriods: 4,
  tailTradingDays: 4,
  visibilityMode: 'research-assumption',
  calendarDecisionRaw: '{}',
  domesticRuleDecisionRaw: '{}',
});
const response = () => ({
  ...identity,
  coverage: { complete: true, startDate: '2026-09-07', endDate: '2026-09-08' },
  source: {
    adapterRevision: 'efinance-fund-nav-raw-v1',
    sourceRevision: 'eastmoney-fund-nav-raw-v1',
    providerRevision: 'eastmoney-fund-nav-raw-v1',
    credentialRevision: 'not-required',
    responseHash: hash,
    capturedAt: '2026-09-30T00:00:00Z',
  },
  admission: {
    consumer: 'thesis-ledger',
    routeKey: key,
    target,
    status: 'admitted',
    admissionState: 'admitted',
    evidenceRef: 'fixture://nav',
    evidenceSha256: hash,
    scopeSymbols: ['161725.OF'],
    scopeDateFrom: '2026-09-01',
    scopeDateTo: '2026-09-30',
    adapterRevision: 'efinance-fund-nav-raw-v1',
    sourceRevision: 'eastmoney-fund-nav-raw-v1',
    credentialRevision: 'not-required',
    validFrom: '2026-09-01T00:00:00Z',
    validUntil: '2026-10-01T00:00:00Z',
    recordVersion: 1,
    recordedAt: '2026-09-01T00:00:00Z',
    invalidatedAt: null,
    invalidationReason: null,
  },
  calendar: {
    symbol: '161725.OF',
    market: 'CN',
    timezone: 'Asia/Shanghai',
    version: 'fixture',
    contentHash: hash,
    evidenceRef: 'research-config://calendar',
    availableAt: '2026-09-29T00:00:00Z',
    coverage: { complete: true, startDate: '2026-09-07', endDate: '2026-09-09' },
    valuationDates: ['2026-09-07', '2026-09-08', '2026-09-09'],
    tradingDates: ['2026-09-07', '2026-09-08', '2026-09-09'],
    disclosureWorkDates: ['2026-09-07', '2026-09-08', '2026-09-09'],
  },
  navVisibility: {
    mode: 'research-assumption',
    boundary: 'after-disclosure-day-end',
    timezone: 'Asia/Shanghai',
    disclosureCalendarHash: hash,
    rule: {
      id: 'rule',
      version: '1',
      symbol: '161725.OF',
      fundType: 'domestic',
      applicableRange: { startDate: '2026-09-01', endDate: '2026-09-30' },
      delayWorkdays: 1,
      basis: 'domestic-default',
      evidenceRef: 'research-config://rule',
      documentHash: hash,
      contentHash: hash,
      configuredAt: '2026-09-01T00:00:00Z',
    },
  },
  facts: ['2026-09-07', '2026-09-08'].map((day) => ({
    symbol: '161725.OF',
    valuationDate: day,
    nav: '1.2300',
    status: 'supported',
    freshness: 'delayed',
    quality: 'complete',
    occurredAt: `${day}T00:00:00+08:00`,
    availableAt: '2026-09-10T00:00:00+08:00',
    publicationEvidence: {
      kind: 'research-assumption',
      sourceRecordId: day,
      rawRecordHash: hash,
      evidenceRef: 'research-config://rule',
      ruleHash: hash,
      disclosureCalendarHash: hash,
      disclosureDate: '2026-09-09',
      assumedAvailableAt: '2026-09-10T00:00:00+08:00',
    },
  })),
  publicationRecords: ['2026-09-07', '2026-09-08'].map((sourceRecordId) => ({
    sourceRecordId,
    rawRecord: '{}',
  })),
  responseRaw: '{}',
  ruleRaw: '{}',
  calendarRaw: '{}',
  assumptionRaw: '{}',
  calendarDecisionRaw: '{}',
});

describe('NAV 精确来源合同', () => {
  it('显式请求和当前版本的研究响应可解析', () => {
    expect(backtestNavSourceRequestV3Schema.safeParse(request()).success).toBe(true);
    expect(backtestNavSourceResponseV3Schema.safeParse(response()).success).toBe(true);
  });
  it.each(['fundType', 'calendarDecisionRaw', 'domesticRuleDecisionRaw'])(
    '请求缺少 %s 拒绝',
    (field) => {
      const value = request() as Record<string, unknown>;
      delete value[field];
      expect(backtestNavSourceRequestV3Schema.safeParse(value).success).toBe(false);
    },
  );
  it.each(['source', 'admission', 'records', 'dates', 'rule', 'reference', 'future', 'strict'])(
    '拒绝 %s 错配',
    (name) => {
      const value = response();
      if (name === 'source') value.source.sourceRevision = 'old';
      else if (name === 'admission') value.admission.scopeDateTo = '2026-09-08';
      else if (name === 'records') value.publicationRecords.pop();
      else if (name === 'dates') value.calendar.valuationDates.reverse();
      else if (name === 'rule') value.navVisibility.rule.symbol = '118001.OF';
      else if (name === 'reference')
        value.facts[0]!.publicationEvidence.evidenceRef = 'source-page://fixture';
      else if (name === 'future') value.source.capturedAt = '2026-10-01T00:00:00.000001Z';
      else value.navVisibility.mode = 'strict-publication';
      expect(backtestNavSourceResponseV3Schema.safeParse(value).success).toBe(false);
    },
  );
});
