import type { BacktestNavSourceRequestV3 } from '@thesis-ledger/schemas';
import { navCanonical, navHash } from '../../src/integration/dsa/dsa-nav-raw.js';

/** 受控三日来源，包含实际原生片段和全部规则/假设原文。 */
export function navSourceFixture() {
  const symbol = '161725.OF';
  const capturedAt = '2026-09-30T15:01:00Z';
  const configuredAt = '2026-09-30T14:00:00Z';
  const key = {
    kind: 'data',
    market: 'CN',
    assetType: 'MUTUAL_FUND',
    capability: 'FUND_NAV_HISTORY',
  } as const;
  const target = { providerId: 'efinance', upstreamSource: 'eastmoney' } as const;
  const range = { startDate: '2026-09-01', endDate: '2026-09-30' };
  const domesticRaw = navCanonical({
    schemaVersion: 'nav-research-default-v1',
    symbol,
    fundType: 'domestic',
    delayWorkdays: 1,
    applicableRange: range,
    configuredAt,
    decision: '用户选择普通 T+1 研究口径',
  });
  const calendarDecisionRaw = navCanonical({
    schemaVersion: 'nav-research-calendar-decision-v1',
    symbol,
    basis: 'nav-dates-xshg-intersection-v1',
    configuredAt,
    decision: '用户确认缺日不交易研究口径',
  });
  const request: BacktestNavSourceRequestV3 = {
    contractVersion: 3,
    requestId: 'nav-client-test',
    symbol,
    fundType: 'domestic',
    routeKey: key,
    routeTarget: { ...target, routeIndex: 0 },
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 2,
    dataAsOf: '2026-10-01T00:00:00Z',
    start: '2026-09-08',
    end: '2026-09-08',
    warmupPeriods: 1,
    tailTradingDays: 1,
    visibilityMode: 'research-assumption',
    calendarDecisionRaw,
    domesticRuleDecisionRaw: domesticRaw,
  };
  const sourceDays = ['2026-09-07', '2026-09-08', '2026-09-09'];
  const { source, native } = rawSourceFixture(sourceDays);
  const ruleRaw = navCanonical({
    id: `nav-domestic-default:${symbol}`,
    version: 'user-t1-default-v1',
    symbol,
    fundType: 'domestic',
    applicableRange: range,
    delayWorkdays: 1,
    basis: 'domestic-default',
    evidenceRef: `research-config://nav-domestic/${navHash(domesticRaw)}`,
    documentHash: navHash(domesticRaw),
    configuredAt,
  });
  const rule = { ...JSON.parse(ruleRaw), contentHash: navHash(ruleRaw) };
  const assumptionRaw = navCanonical({
    schemaVersion: 'nav-research-calendar-assumption-v1',
    symbol,
    decisionHash: navHash(calendarDecisionRaw),
    sourceHash: source.contentHash,
    sourceRevision: source.readerRevision,
    sourceCapturedAt: source.capturedAt,
    ruleHash: rule.contentHash,
    exchangeCalendar: {
      adapterRevision: 'release-evidence-v1',
      calendar: 'XSHG',
      availableAt: '2026-03-10T03:24:37.055242+00:00',
      version: '4.13.2',
      sourceHash: '3dd6286cd2404bbe188e843a7ada5625164fff6059eb18c69d080213c3e29dea',
    },
    valuationBasis: 'source-nav-dates',
    processingBasis: 'nav-dates-xshg-intersection',
    disclosureBasis: 'xshg-workdays',
    missingDate: 'untradable',
    limitations: ['historical-suspension', 'subscription-limits', 'investor-channel-differences'],
  });
  const calendarPayload = {
    symbol,
    market: 'CN',
    timezone: 'Asia/Shanghai',
    version: `nav-research-calendar-v1:${navHash(assumptionRaw)}`,
    coverage: { startDate: sourceDays[0], endDate: sourceDays[2], complete: true },
    valuationDates: sourceDays,
    tradingDates: sourceDays,
    disclosureWorkDates: sourceDays,
  };
  const calendarRaw = navCanonical(calendarPayload);
  const calendar = {
    ...calendarPayload,
    contentHash: navHash(calendarRaw),
    evidenceRef: `research-config://nav-calendar/${navHash(assumptionRaw)}`,
    availableAt: source.capturedAt,
  };
  const { records, publicationRecords, facts } = sourceRecordFixture(
    native,
    sourceDays,
    symbol,
    rule,
    calendar.contentHash,
  );
  const identityRaw = 'var reData={datas:[["161725","QDII 混淆名字","指数型-股票"]],record:"1"}';
  const envelope = {
    schemaVersion: 'nav-source-record-envelope-v1',
    symbol,
    fundType: 'domestic',
    capturedAt,
    identity: {
      symbol,
      fundType: 'domestic',
      sourceType: '指数型-股票',
      endpoint: 'https://fund.eastmoney.com/Data/Fund_JJJZ_Data.aspx',
      readerRevision: 'eastmoney-fund-identity-v1',
      responseRaw: identityRaw,
      responseHash: navHash(identityRaw),
      capturedAt: source.capturedAt,
    },
    navSource: source,
    records,
    ruleDocument: {
      kind: 'research-config',
      encoding: 'base64',
      raw: Buffer.from(domesticRaw).toString('base64'),
      contentHash: rule.documentHash,
      capturedAt: source.capturedAt,
      readerRevision: 'nav-user-default-v1',
    },
    ruleRaw,
    calendarRaw,
    assumptionRaw,
    calendarDecisionRaw,
  };
  const responseRaw = navCanonical(envelope);
  const response = {
    contractVersion: 3,
    requestId: request.requestId,
    symbol,
    routeKey: key,
    routeTarget: request.routeTarget,
    desiredRevision: 1,
    effectivePolicyRevision: 1,
    catalogRevision: 2,
    dataAsOf: request.dataAsOf,
    coverage: { complete: true, startDate: '2026-09-07', endDate: request.end },
    source: {
      adapterRevision: 'efinance-fund-nav-raw-v1',
      sourceRevision: source.readerRevision,
      providerRevision: source.readerRevision,
      credentialRevision: 'not-required',
      responseHash: navHash(responseRaw),
      capturedAt,
    },
    admission: {
      consumer: 'thesis-ledger',
      routeKey: key,
      target,
      status: 'admitted',
      admissionState: 'admitted',
      evidenceRef: 'fixture://review',
      evidenceSha256: 'a'.repeat(64),
      scopeSymbols: [symbol],
      scopeDateFrom: range.startDate,
      scopeDateTo: range.endDate,
      adapterRevision: 'efinance-fund-nav-raw-v1',
      sourceRevision: source.readerRevision,
      credentialRevision: 'not-required',
      validFrom: '2026-09-01T00:00:00Z',
      validUntil: '2026-10-02T00:00:00Z',
      recordVersion: 1,
      recordedAt: '2026-09-01T00:00:00Z',
      invalidatedAt: null,
      invalidationReason: null,
    },
    calendar,
    navVisibility: {
      mode: 'research-assumption',
      boundary: 'after-disclosure-day-end',
      timezone: 'Asia/Shanghai',
      rule,
      disclosureCalendarHash: calendar.contentHash,
    },
    facts,
    publicationRecords,
    responseRaw,
    ruleRaw,
    calendarRaw,
    assumptionRaw,
    calendarDecisionRaw,
  };
  return { request, response, envelope };
}

/** 原生记录、规范记录及研究可见性事实形成同一组受控证据。 */
function sourceRecordFixture(
  native: Array<{ FSRQ: string; DWJZ: string; LJJZ: string }>,
  sourceDays: string[],
  symbol: string,
  rule: { evidenceRef: string; contentHash: string },
  calendarHash: string,
) {
  const records = native.slice(0, 2).map((item) => {
    const raw = JSON.stringify(item);
    return {
      sourceRecordId: `eastmoney-nav-raw-v1:${symbol}:${navHash(raw)}`,
      symbol,
      valuationDate: item.FSRQ,
      nav: item.DWJZ,
      projectionRevision: 'dsa-eastmoney-nav-record-v1',
      nativeRecordRaw: raw,
      nativeRecordHash: navHash(raw),
      sourcePageIndex: 1,
    };
  });
  const publicationRecords = records.map((record) => ({
    sourceRecordId: record.sourceRecordId,
    rawRecord: navCanonical(record),
  }));
  const facts = records.map((record, index) => {
    const disclosureDate = sourceDays[index + 1]!;
    const next = new Date(`${disclosureDate}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    const availableAt = `${next.toISOString().slice(0, 10)}T00:00:00+08:00`;
    return {
      symbol,
      valuationDate: record.valuationDate,
      nav: record.nav,
      status: 'supported',
      freshness: 'delayed',
      quality: 'complete',
      occurredAt: `${record.valuationDate}T00:00:00+08:00`,
      availableAt,
      publicationEvidence: {
        kind: 'research-assumption',
        sourceRecordId: record.sourceRecordId,
        rawRecordHash: navHash(publicationRecords[index]!.rawRecord),
        evidenceRef: rule.evidenceRef,
        ruleHash: rule.contentHash,
        disclosureCalendarHash: calendarHash,
        disclosureDate,
        assumedAvailableAt: availableAt,
      },
    };
  });
  return { records, publicationRecords, facts };
}

/** 来源分页及整批指纹与规范投影分开构造。 */
function rawSourceFixture(sourceDays: string[]) {
  const native = sourceDays.map((day) => ({ FSRQ: day, DWJZ: '1.2300', LJJZ: '2.0000' }));
  const rawResponse = JSON.stringify({
    Success: true,
    ErrCode: 0,
    ErrorCode: '0',
    TotalCount: 3,
    Datas: [...native].reverse(),
  });
  const pages = [{ pageIndex: 1, rawResponse, contentHash: navHash(rawResponse) }];
  const source = {
    fundCode: '161725',
    endpoint: 'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList',
    readerRevision: 'eastmoney-fund-nav-raw-v1',
    capturedAt: '2026-09-30T15:00:00Z',
    totalCount: 3,
    contentHash: navHash(
      navCanonical({
        fundCode: '161725',
        endpoint: 'https://fundmobapi.eastmoney.com/FundMNewApi/FundMNHisNetList',
        readerRevision: 'eastmoney-fund-nav-raw-v1',
        pages: pages.map(({ pageIndex, contentHash }) => ({ pageIndex, contentHash })),
      }),
    ),
    pages,
  };
  return { source, native };
}
