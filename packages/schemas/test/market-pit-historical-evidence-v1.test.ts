import { describe, expect, it } from 'vitest';
import {
  marketPitHistoricalDecisionWindowV3Schema,
  marketPitEvidenceWithinLimits,
  MARKET_PIT_HISTORICAL_MAX_DATES,
  MARKET_PIT_HISTORICAL_MAX_BARS,
  MARKET_PIT_HISTORICAL_MAX_RAW_BYTES,
  MARKET_PIT_RECONSTRUCTION_MAX_BYTES,
  type HistoricalDecisionWindowV3,
} from '../src/market-pit-historical-evidence-v1.js';

const hash = 'a'.repeat(64);
const fixture = (): HistoricalDecisionWindowV3 => {
  const knownAvailableAt = '2026-01-01T00:00:00Z';
  const publication = {
    id: 'publication',
    kind: 'exchange-publication' as const,
    publisher: 'exchange',
    originUri: 'https://exchange.example/calendar',
    revision: '2026',
    parserVersion: 'structural-fixture-v1',
    raw: { encoding: 'utf8' as const, bytes: '{}', sha256: hash },
    publicationLocator: '/publishedAt',
    knownAvailableAt,
    acquiredAt: knownAvailableAt,
  };
  const dates = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'];
  return {
    contractVersion: 1,
    kind: 'market-pit-historical-decision-window',
    originalEvidence: [
      publication,
      { ...publication, id: 'capture', kind: 'server-archive-capture' },
    ],
    calendarArtifacts: [],
    calendars: [
      {
        id: 'calendar',
        calendarContentHash: hash,
        projectionHash: hash,
        market: 'CN',
        exchange: 'SZSE',
        timezone: 'Asia/Shanghai',
        symbolScope: ['159516.SZ'],
        venueBindingEvidenceIds: ['publication'],
        historicalRange: { start: dates[0]!, end: dates.at(-1)! },
        knownAvailableAt,
        acquiredAt: knownAvailableAt,
        normalizationVersion: 'v1',
        timezoneRulesIdentity: 'fixture-v1',
        publicationIds: ['publication'],
        dateStates: dates.map((date) => ({
          date,
          status: 'open',
          reason: 'regular',
          publicationIds: ['publication'],
          sessions: [
            {
              startMinute: 570,
              endMinute: 900,
              openedAt: `${date}T09:30:00+08:00`,
              closedAt: `${date}T15:00:00+08:00`,
            },
          ],
        })),
      },
    ],
    sourceWitnesses: [
      {
        id: 'witness',
        windowIdentityFingerprint: hash,
        completeResponseHash: hash,
        captureEvidenceId: 'capture',
        revisionPublicationIds: ['publication'],
        revisionKnownAvailableAt: knownAvailableAt,
      },
    ],
    barDecisionBindings: dates.slice(0, -1).map((date, index) => ({
      timestamp: `${date}T07:00:00.000Z`,
      windowIdentityFingerprint: hash,
      completeResponseHash: hash,
      calendarEvidenceId: 'calendar',
      sourceWitnessId: 'witness',
      tradingDate: date,
      decisionAt: `${date}T15:00:00+08:00`,
      closedAt: `${date}T15:00:00+08:00`,
      nextTradingDate: dates[index + 1]!,
      nextOpenedAt: `${dates[index + 1]}T09:30:00+08:00`,
    })),
  };
};
const rejected = (change: (value: HistoricalDecisionWindowV3) => void) => {
  const value = fixture();
  change(value);
  expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
};

describe('独立历史决策窗口结构合同', () => {
  it('接受完整日历与最后 Bar 后继，结构通过不授予 parser 或历史真实性', () => {
    const value = fixture();
    expect(marketPitHistoricalDecisionWindowV3Schema.parse(value)).toEqual(value);
    expect(value.calendars[0]!.dateStates).toHaveLength(value.barDecisionBindings.length + 1);
    expect(value).not.toHaveProperty('verified');
  });
  it.each(['duplicate', 'missing', 'kind', 'hash'] as const)('拒绝 %s 的身份或交叉引用', (kind) =>
    rejected((value) => {
      if (kind === 'duplicate') value.sourceWitnesses[0]!.id = 'publication';
      else if (kind === 'missing') value.barDecisionBindings[0]!.calendarEvidenceId = 'absent';
      else if (kind === 'kind') value.sourceWitnesses[0]!.captureEvidenceId = 'publication';
      else value.barDecisionBindings[0]!.completeResponseHash = 'b'.repeat(64);
    }),
  );
  it.each(['gap', 'order', 'duplicate', 'false-closed', 'false-open'] as const)(
    '拒绝 %s 的逐日状态',
    (kind) =>
      rejected((value) => {
        const states = value.calendars[0]!.dateStates;
        if (kind === 'gap') states.splice(1, 1);
        else if (kind === 'order') states.reverse();
        else if (kind === 'duplicate') states[1]!.date = states[0]!.date;
        else if (kind === 'false-closed') states[0]!.status = 'closed';
        else states[0]!.sessions = [];
      }),
  );
  it('不猜测缺失的周末，连续明确休市后可找到真实后继', () => {
    const value = fixture();
    value.calendars[0]!.dateStates[1]!.status = 'closed';
    value.calendars[0]!.dateStates[1]!.reason = 'exchange-holiday';
    value.calendars[0]!.dateStates[1]!.sessions = [];
    value.barDecisionBindings.splice(1, 1);
    value.barDecisionBindings[0]!.nextTradingDate = '2026-05-20';
    value.barDecisionBindings[0]!.nextOpenedAt = '2026-05-20T09:30:00+08:00';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(true);
  });
  it.each([
    'missing-successor',
    'wrong-successor',
    'next-open',
    'before-close',
    'horizon',
  ] as const)('拒绝 %s 的决策窗口', (kind) =>
    rejected((value) => {
      if (kind === 'missing-successor') {
        value.calendars[0]!.dateStates.pop();
        value.calendars[0]!.historicalRange.end = '2026-05-20';
      } else if (kind === 'wrong-successor')
        value.barDecisionBindings[0]!.nextTradingDate = '2026-05-20';
      else if (kind === 'next-open')
        value.barDecisionBindings[0]!.decisionAt = value.barDecisionBindings[0]!.nextOpenedAt;
      else if (kind === 'before-close')
        value.barDecisionBindings[0]!.decisionAt = '2026-05-18T14:59:59+08:00';
      else value.calendars[0]!.knownAvailableAt = '2026-05-18T16:00:00+08:00';
    }),
  );
  it.each([
    'overlap',
    'midnight',
    'minute-mismatch',
    'invalid-date',
    'no-offset',
    'timezone',
  ] as const)('拒绝 %s 的时间', (kind) =>
    rejected((value) => {
      const cal = value.calendars[0]!;
      if (kind === 'overlap')
        cal.dateStates[0]!.sessions.push({ ...cal.dateStates[0]!.sessions[0]! });
      else if (kind === 'midnight')
        cal.dateStates[0]!.sessions[0]!.closedAt = '2026-05-19T00:00:00+08:00';
      else if (kind === 'minute-mismatch') cal.dateStates[0]!.sessions[0]!.startMinute = 600;
      else if (kind === 'invalid-date') cal.historicalRange.start = '2026-02-30';
      else if (kind === 'no-offset')
        value.barDecisionBindings[0]!.decisionAt = '2026-05-18T15:00:00';
      else cal.timezone = 'Mars/Unknown';
    }),
  );
  it('制品可省略，但存在时原文、路径及发布引用必须完整', () => {
    rejected((value) => {
      value.calendars[0]!.calendarArtifactId = 'absent';
    });
    rejected((value) => {
      value.calendarArtifacts.push({
        id: 'artifact',
        version: 'v1',
        artifactSha256: hash,
        sourceTreeHash: hash,
        publicationId: 'publication',
        files: [{ relativePath: '../escape', rawBase64: 'e30=', sha256: hash }],
      });
    });
  });
  it('接受零字节源码，但原始证据非空且源码文件与摘要必须完整', () => {
    const value = fixture();
    value.originalEvidence.push({
      ...value.originalEvidence[0]!,
      id: 'package-publication',
      kind: 'calendar-package-release',
    });
    value.calendars[0]!.publicationIds.push('package-publication');
    const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    value.calendarArtifacts.push({
      id: 'artifact',
      version: 'v1',
      artifactSha256: hash,
      sourceTreeHash: hash,
      publicationId: 'package-publication',
      files: [
        {
          relativePath: 'exchange_calendars/pandas_extensions/__init__.py',
          rawBase64: '',
          sha256: emptyHash,
        },
        { relativePath: 'exchange_calendars/utils/__init__.py', rawBase64: '', sha256: emptyHash },
      ],
    });
    value.calendars[0]!.calendarArtifactId = 'artifact';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(true);
    const missingBytes = structuredClone(value);
    Reflect.deleteProperty(missingBytes.calendarArtifacts[0]!.files[0]!, 'rawBase64');
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(missingBytes).success).toBe(false);
    const missingDigest = structuredClone(value);
    Reflect.deleteProperty(missingDigest.calendarArtifacts[0]!.files[0]!, 'sha256');
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(missingDigest).success).toBe(false);
    const missingFiles = structuredClone(value);
    missingFiles.calendarArtifacts[0]!.files = [];
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(missingFiles).success).toBe(false);
    for (const encoding of ['utf8', 'base64'] as const) {
      const emptyEvidence = structuredClone(value);
      emptyEvidence.originalEvidence[0]!.raw = { encoding, bytes: '', sha256: emptyHash };
      expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(emptyEvidence).success).toBe(
        false,
      );
    }
  });
  it('制品发布必须属于引用日历的发布集合，文件路径不得重复', () => {
    const value = fixture();
    value.originalEvidence.push({
      ...value.originalEvidence[0]!,
      id: 'package-publication',
      kind: 'calendar-package-release',
    });
    value.calendarArtifacts.push({
      id: 'artifact',
      version: 'v1',
      artifactSha256: hash,
      sourceTreeHash: hash,
      publicationId: 'package-publication',
      files: [{ relativePath: 'calendar.py', rawBase64: 'e30=', sha256: hash }],
    });
    value.calendars[0]!.calendarArtifactId = 'artifact';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
    value.calendars[0]!.publicationIds.push('package-publication');
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(true);
    value.calendarArtifacts[0]!.files.push({ ...value.calendarArtifacts[0]!.files[0]! });
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
  });
  it('拒绝原文未知字段和无效编码', () => {
    expect(
      marketPitHistoricalDecisionWindowV3Schema.safeParse({ ...fixture(), verified: true }).success,
    ).toBe(false);
    rejected((value) => {
      value.originalEvidence[0]!.raw = { encoding: 'base64', bytes: '!!!', sha256: hash };
    });
  });
  it('在日期展开和记录解析前拒绝总日期、Bar、跨度及外层字节超限', () => {
    expect(
      marketPitEvidenceWithinLimits({
        barDecisionBindings: Array(MARKET_PIT_HISTORICAL_MAX_BARS + 1).fill(null),
      }),
    ).toBe(false);
    expect(
      marketPitEvidenceWithinLimits({
        calendars: [{ dateStates: Array(MARKET_PIT_HISTORICAL_MAX_DATES + 1).fill(null) }],
      }),
    ).toBe(false);
    expect(
      marketPitEvidenceWithinLimits({
        calendars: [
          { dateStates: Array(60_000).fill(null) },
          { dateStates: Array(40_001).fill(null) },
        ],
      }),
    ).toBe(false);
    rejected((value) => {
      value.calendars[0]!.historicalRange.end = '2400-01-01';
    });
    expect(
      marketPitEvidenceWithinLimits({ oversized: 'x'.repeat(MARKET_PIT_RECONSTRUCTION_MAX_BYTES) }),
    ).toBe(false);
    rejected((value) => {
      value.originalEvidence[0]!.raw.bytes = 'x'.repeat(MARKET_PIT_HISTORICAL_MAX_RAW_BYTES + 1);
    });
  });
});
