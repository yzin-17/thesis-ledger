import { describe, expect, it } from 'vitest';
import {
  marketPitHistoricalDecisionWindowV3Schema,
  type HistoricalDecisionWindowV3,
} from '../src/market-pit-historical-evidence-v1.js';

const fixture = (): HistoricalDecisionWindowV3 => {
  const hash = 'a'.repeat(64);
  const knownAvailableAt = '2026-01-01T00:00:00Z';
  const publication = {
    id: 'publication',
    kind: 'exchange-publication' as const,
    publisher: 'structural-fixture',
    originUri: 'https://example.test/calendar',
    revision: 'v1',
    parserVersion: 'structural-fixture',
    raw: { encoding: 'utf8' as const, bytes: '{}', sha256: hash },
    publicationLocator: '/time',
    knownAvailableAt,
    acquiredAt: knownAvailableAt,
  };
  return {
    contractVersion: 1,
    kind: 'market-pit-historical-decision-window',
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
        historicalRange: { start: '2026-05-18', end: '2026-05-19' },
        knownAvailableAt,
        acquiredAt: knownAvailableAt,
        normalizationVersion: 'structural-fixture',
        timezoneRulesIdentity: 'unverified-fixture',
        publicationIds: ['publication'],
        dateStates: ['2026-05-18', '2026-05-19'].map((date) => ({
          date,
          status: 'open',
          reason: 'regular',
          publicationIds: ['publication'],
          sessions: [
            {
              startMinute: 570,
              endMinute: 900,
              openedAt: `${date}T01:30:00.000Z`,
              closedAt: `${date}T07:00:00.000Z`,
            },
          ],
        })),
      },
    ],
    originalEvidence: [
      publication,
      { ...publication, id: 'capture', kind: 'server-archive-capture' },
    ],
    calendarArtifacts: [],
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
    barDecisionBindings: [
      {
        timestamp: '2026-05-18T07:00:00Z',
        windowIdentityFingerprint: hash,
        completeResponseHash: hash,
        calendarEvidenceId: 'calendar',
        sourceWitnessId: 'witness',
        tradingDate: '2026-05-18',
        decisionAt: '2026-05-18T07:00:00Z',
        closedAt: '2026-05-18T07:00:00Z',
        nextTradingDate: '2026-05-19',
        nextOpenedAt: '2026-05-19T01:30:00Z',
      },
    ],
  };
};

describe('日历绝对瞬时与声明时区的当地分钟', () => {
  it.each(['utc', 'local-offset', 'other-offset'] as const)(
    '同一瞬时的 %s 表示等价且不改写原文',
    (kind) => {
      const value = fixture();
      for (const state of value.calendars[0]!.dateStates) {
        const session = state.sessions[0]!;
        if (kind === 'local-offset') {
          session.openedAt = `${state.date}T09:30:00+08:00`;
          session.closedAt = `${state.date}T15:00:00+08:00`;
        } else if (kind === 'other-offset') {
          session.openedAt = `${state.date}T03:30:00+02:00`;
          session.closedAt = `${state.date}T09:00:00+02:00`;
        }
      }
      const original = structuredClone(value);
      expect(marketPitHistoricalDecisionWindowV3Schema.parse(value)).toEqual(original);
      expect(value).toEqual(original);
    },
  );
  it('当地日期可与 UTC 日期不同，同日约束依据声明时区', () => {
    const value = fixture();
    const cal = value.calendars[0]!;
    cal.dateStates[0]!.sessions[0] = {
      startMinute: 30,
      endMinute: 60,
      openedAt: '2026-05-17T16:30:00Z',
      closedAt: '2026-05-17T17:00:00Z',
    };
    value.barDecisionBindings[0]!.closedAt = '2026-05-17T17:00:00Z';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(true);
  });
  it.each([
    '2026-05-18T09:30:00Z',
    '2026-05-18T09:30:00+07:00',
    '2026-05-17T01:30:00Z',
    '2026-05-18T01:31:00Z',
    '2026-05-18T01:30:01Z',
    '2026-05-18T01:30:00.000001Z',
    '2026-05-18T01:30:00.0000000001Z',
  ])('拒绝错误当地日期、分钟或非整分钟 %s', (openedAt) => {
    const value = fixture();
    value.calendars[0]!.dateStates[0]!.sessions[0]!.openedAt = openedAt;
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
  });
  it.each(['2026-05-18T07:00:01Z', '2026-05-18T07:00:00.000001Z'])(
    '收盘也拒绝非整分钟 %s',
    (closedAt) => {
      const value = fixture();
      value.calendars[0]!.dateStates[0]!.sessions[0]!.closedAt = closedAt;
      expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
    },
  );
  it('零小数精度保持合法，endMinute 1440 不绕过当前同日模型', () => {
    const value = fixture();
    const session = value.calendars[0]!.dateStates[0]!.sessions[0]!;
    session.openedAt = '2026-05-18T01:30:00.000000Z';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(true);
    session.endMinute = 1440;
    session.closedAt = '2026-05-19T00:00:00+08:00';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
  });
  it.each(['order', 'overlap', 'zero-length', 'timezone'] as const)('保持 %s 拒绝', (kind) => {
    const value = fixture();
    const cal = value.calendars[0]!;
    const state = cal.dateStates[0]!;
    if (kind === 'timezone') cal.timezone = 'Invalid/Timezone';
    else if (kind === 'zero-length') state.sessions[0]!.endMinute = 570;
    else {
      state.sessions.push({
        startMinute: 600,
        endMinute: 690,
        openedAt: '2026-05-18T02:00:00Z',
        closedAt: '2026-05-18T03:30:00Z',
      });
      if (kind === 'order') state.sessions.reverse();
    }
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(value).success).toBe(false);
  });
});
