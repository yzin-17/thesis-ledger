import { describe, expect, it } from 'vitest';
import { type HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import {
  bindMarketPitDailyDecisionWindowsV3,
  type MarketPitDecisionWindowInputV3,
} from '../../src/market/market-pit-decision-window-v3.js';
import { bindMarketPitArchiveContentV3 } from '../../src/market/market-pit-reconstruction-content-v3.js';
import { bindMarketPitSourceTimesV3 } from '../../src/market/market-pit-reconstruction-source-times-v3.js';
import { marketFrozenWindowHashV3 } from '../../src/market/market-frozen-window-v3.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

type Evidence = HistoricalDecisionWindowV3;
const hash = (letter: string) => letter.repeat(64);

function openDay(date: string): Evidence['calendars'][number]['dateStates'][number] {
  return {
    date,
    status: 'open',
    reason: 'regular',
    publicationIds: ['publication'],
    sessions: [
      {
        startMinute: 570,
        endMinute: 690,
        openedAt: `${date}T01:30:00Z`,
        closedAt: `${date}T03:30:00Z`,
      },
      {
        startMinute: 780,
        endMinute: 900,
        openedAt: `${date}T05:00:00Z`,
        closedAt: `${date}T07:00:00Z`,
      },
    ],
  };
}

/** 合成上游日历投影仅供纯算法单测；没有调用或冒充登记原文 parser。 */
const shanghaiDate = (timestamp: string) =>
  new Date(Date.parse(timestamp) + 8 * 60 * 60 * 1_000).toISOString().slice(0, 10);

async function fixture(firstBarAtLocalMidnight = false): Promise<MarketPitDecisionWindowInputV3> {
  const f = await pitReconstructionFixture();
  if (firstBarAtLocalMidnight) {
    const timestamp = '2026-05-17T16:00:00Z';
    f.input.response.bars[0]!.timestamp = timestamp;
    f.input.response.coverage.actualStart = timestamp;
    f.proof.barArchives[0]!.timestamp = timestamp;
  }
  for (const [index, bar] of f.input.response.bars.entries()) {
    const daily = structuredClone(f.input);
    const day = shanghaiDate(bar.timestamp);
    daily.request.start = daily.request.end = day;
    daily.response.bars = [bar];
    daily.response.sourcePriceBasis.observedAt = bar.availableAt;
    daily.response.inputFingerprint = `unit-daily-${day}`;
    daily.response.coverage = {
      requestedStart: day,
      requestedEnd: day,
      actualStart: bar.timestamp,
      actualEnd: bar.timestamp,
      hasMoreBefore: false,
      latestCompleteTradingDate: day,
    };
    daily.response.coverageProof.window.requestedStart =
      daily.response.coverageProof.window.requestedEnd = day;
    daily.response.coverageProof.calendar.expectedSessionDates = [day];
    const archive = await f.record(daily, new Date(`${day}T07:00:01Z`));
    f.proof.barArchives[index]!.windowIdentityFingerprint = archive.identityFingerprint;
    f.proof.barArchives[index]!.completeResponseHash = archive.completeResponseHash!;
  }
  const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
  if (content.status !== 'archives-bound') throw new Error('fixture content');
  const sourceTimes = bindMarketPitSourceTimesV3(content);
  if (sourceTimes.status !== 'source-times-bound') throw new Error('fixture clocks');
  const publication: Evidence['originalEvidence'][number] = {
    id: 'publication',
    kind: 'exchange-publication',
    publisher: 'unit-only',
    originUri: 'https://example.test/unit',
    revision: 'unit',
    parserVersion: 'unit-only-unregistered',
    raw: { encoding: 'utf8', bytes: '{}', sha256: hash('a') },
    publicationLocator: 'unit',
    knownAvailableAt: '2026-05-01T00:00:00Z',
    acquiredAt: '2026-05-21T07:00:00Z',
  };
  const calendar: Evidence['calendars'][number] = {
    id: 'calendar',
    calendarContentHash: hash('b'),
    projectionHash: hash('c'),
    market: 'CN',
    exchange: 'UNIT',
    timezone: 'Asia/Shanghai',
    symbolScope: [f.input.request.symbol],
    venueBindingEvidenceIds: ['publication'],
    historicalRange: { start: '2026-05-18', end: '2026-05-21' },
    knownAvailableAt: publication.knownAvailableAt,
    acquiredAt: publication.acquiredAt,
    normalizationVersion: 'unit-only',
    timezoneRulesIdentity: 'unit-fixed-UTC+08',
    publicationIds: ['publication'],
    dateStates: ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'].map(openDay),
  };
  const captures = content.archives.map((archive, index) => ({
    ...publication,
    id: `capture-${index}`,
    kind: 'server-archive-capture' as const,
    knownAvailableAt: archive.evidence.fetchedAt,
    acquiredAt: archive.evidence.fetchedAt,
  }));
  const evidence: Evidence = {
    contractVersion: 1,
    kind: 'market-pit-historical-decision-window',
    calendars: [calendar],
    originalEvidence: [publication, ...captures],
    calendarArtifacts: [],
    sourceWitnesses: content.proof.barArchives.map((ref, index) => ({
      id: `witness-${index}`,
      windowIdentityFingerprint: ref.windowIdentityFingerprint,
      completeResponseHash: ref.completeResponseHash,
      captureEvidenceId: `capture-${index}`,
      revisionPublicationIds: ['publication'],
      revisionKnownAvailableAt: publication.knownAvailableAt,
    })),
    barDecisionBindings: content.proof.barArchives.map((ref, index) => ({
      ...ref,
      calendarEvidenceId: 'calendar',
      sourceWitnessId: `witness-${index}`,
      tradingDate: shanghaiDate(ref.timestamp),
      decisionAt: f.input.response.bars[index]!.availableAt,
      closedAt: `${shanghaiDate(ref.timestamp)}T07:00:00Z`,
      nextTradingDate: calendar.dateStates[index + 1]!.date,
      nextOpenedAt: `${calendar.dateStates[index + 1]!.date}T01:30:00Z`,
    })),
  };
  content.proof = { ...content.proof, contractVersion: 2, historicalDecisionWindow: evidence };
  return {
    input: f.input,
    content,
    sourceTimes,
    calendars: [
      {
        status: 'calendar-package-verified',
        calendar,
        knownAvailableAt: calendar.knownAvailableAt,
      },
    ],
  };
}

function evidence(f: MarketPitDecisionWindowInputV3): Evidence {
  if (f.content.proof.contractVersion !== 2) throw new Error('fixture v2');
  return f.content.proof.historicalDecisionWindow;
}

function refreshArchiveHash(f: MarketPitDecisionWindowInputV3): void {
  const archive = f.content.archives[0]!;
  const completeResponseHash = marketFrozenWindowHashV3(archive.response);
  archive.completeResponseHash = completeResponseHash;
  f.content.proof.barArchives[0]!.completeResponseHash = completeResponseHash;
  evidence(f).barDecisionBindings[0]!.completeResponseHash = completeResponseHash;
  evidence(f).sourceWitnesses[0]!.completeResponseHash = completeResponseHash;
}

function changeDecision(f: MarketPitDecisionWindowInputV3, clock: string): void {
  const bar = f.input.response.bars[0]!;
  bar.availableAt = clock;
  f.content.archives[0]!.response.bars[0]!.availableAt = clock;
  f.sourceTimes.bindings[0]!.availableAt = clock;
  evidence(f).barDecisionBindings[0]!.decisionAt = clock;
  refreshArchiveHash(f);
}

function changeSource(
  f: MarketPitDecisionWindowInputV3,
  field: 'sourceObservedAt' | 'fetchedAt',
  clock: string,
): void {
  f.sourceTimes.bindings[0]![field] = clock;
  if (field === 'sourceObservedAt')
    f.content.archives[0]!.response.sourcePriceBasis.observedAt = clock;
  else f.content.archives[0]!.evidence.fetchedAt = clock;
  refreshArchiveHash(f);
}

describe('逐 Bar 日线窗口必要计算（合成日历单测）', () => {
  it('按上海交易日绑定 UTC 前一日的 Bar 时间', async () => {
    const f = await fixture(true);
    expect(evidence(f).barDecisionBindings[0]!.tradingDate).toBe('2026-05-18');
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result.status === 'unavailable' ? result.reason : result.status).toBe(
      'decision-windows-bound',
    );
    if (result.status === 'decision-windows-bound')
      expect(result.barDecisionBindings[0]!.tradingDate).toBe('2026-05-18');
  });

  it('真实完整收盘相等可计算；保留原时钟和输入，无 successor 价格也能计算', async () => {
    const f = await fixture();
    const before = structuredClone(f);
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result).toEqual({
      status: 'decision-windows-bound',
      barDecisionBindings: evidence(f).barDecisionBindings,
    });
    expect(result).not.toHaveProperty('ready');
    expect(result).not.toHaveProperty('eligible');
    expect(f).toEqual(before);
    if (result.status !== 'decision-windows-bound') throw new Error('unit window');
    expect(result.barDecisionBindings[2]).toMatchObject({
      closedAt: '2026-05-20T07:00:00Z',
      nextTradingDate: '2026-05-21',
      nextOpenedAt: '2026-05-21T01:30:00Z',
    });
    expect(f.input.response.bars.some((bar) => bar.timestamp.startsWith('2026-05-21'))).toBe(false);
  });

  it('收盘后亚毫秒传输允许，远超微秒的小数不会丢失', async () => {
    const f = await fixture();
    changeDecision(f, '2026-05-18T07:00:00.000000000000000001Z');
    changeSource(f, 'sourceObservedAt', '2026-05-18T07:00:00.000000000000000001Z');
    changeSource(f, 'fetchedAt', '2026-05-18T07:00:00.000000000000000002Z');
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result.status).toBe('decision-windows-bound');
    if (result.status === 'decision-windows-bound')
      expect(result.barDecisionBindings[0]!.decisionAt).toBe(f.input.response.bars[0]!.availableAt);
  });

  it.each([
    [
      '下一开盘决策',
      (f: MarketPitDecisionWindowInputV3) => changeDecision(f, '2026-05-19T01:30:00Z'),
      'input-mismatch',
    ],
    [
      '下一开盘抓取',
      (f: MarketPitDecisionWindowInputV3) => changeSource(f, 'fetchedAt', '2026-05-19T01:30:00Z'),
      'historical-source-late',
    ],
    [
      '研究时抓取',
      (f: MarketPitDecisionWindowInputV3) => changeSource(f, 'fetchedAt', '2026-05-21T07:00:00Z'),
      'historical-source-late',
    ],
    [
      '观察晚一微秒',
      (f: MarketPitDecisionWindowInputV3) =>
        changeSource(f, 'sourceObservedAt', '2026-05-18T07:00:00.000001Z'),
      'historical-source-late',
    ],
    [
      '观察早于收盘',
      (f: MarketPitDecisionWindowInputV3) =>
        changeSource(f, 'sourceObservedAt', '2026-05-18T06:59:59.999999Z'),
      'historical-source-late',
    ],
    [
      '传输早于观察',
      (f: MarketPitDecisionWindowInputV3) =>
        changeSource(f, 'fetchedAt', '2026-05-18T06:59:59.999999Z'),
      'historical-source-late',
    ],
    [
      '午休决策',
      (f: MarketPitDecisionWindowInputV3) => changeDecision(f, '2026-05-18T03:30:00Z'),
      'input-mismatch',
    ],
  ])('拒绝 %s', async (_name, mutate, reason) => {
    const f = await fixture();
    (mutate as (f: MarketPitDecisionWindowInputV3) => void)(f);
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({ status: 'unavailable', reason });
  });

  it('观察与抓取相等允许；下一开盘前一极小数仍在窗口，等值和稍晚拒绝', async () => {
    const f = await fixture();
    changeSource(f, 'fetchedAt', '2026-05-18T07:00:00Z');
    expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('decision-windows-bound');
    changeDecision(f, '2026-05-19T01:29:59.999999999999999999Z');
    changeSource(f, 'fetchedAt', '2026-05-19T01:29:59.999999999999999999Z');
    expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('decision-windows-bound');
    changeSource(f, 'fetchedAt', '2026-05-19T01:30:00.000000000000000001Z');
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({
      status: 'unavailable',
      reason: 'historical-source-late',
    });
  });

  it('连续周末连假后取第一开市日首时段，最后输入不要求后继价格', async () => {
    const f = await fixture();
    const calendar = evidence(f).calendars[0]!;
    calendar.dateStates.pop();
    for (const date of ['2026-05-21', '2026-05-22', '2026-05-23', '2026-05-24'])
      calendar.dateStates.push({
        date,
        status: 'closed',
        reason: 'exchange-holiday',
        publicationIds: ['publication'],
        sessions: [],
      });
    calendar.dateStates.push(openDay('2026-05-25'));
    calendar.historicalRange.end = '2026-05-25';
    const claim = evidence(f).barDecisionBindings[2]!;
    claim.nextTradingDate = '2026-05-25';
    claim.nextOpenedAt = '2026-05-25T01:30:00Z';
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result.status).toBe('decision-windows-bound');
    if (result.status === 'decision-windows-bound')
      expect(result.barDecisionBindings[2]).toMatchObject({
        closedAt: '2026-05-20T07:00:00Z',
        nextTradingDate: '2026-05-25',
        nextOpenedAt: '2026-05-25T01:30:00Z',
      });
  });

  it('合成半日仅使用最后真实时段收盘，常规日午休不能成为后继', async () => {
    const f = await fixture();
    evidence(f).calendars[0]!.dateStates[0]!.sessions.pop();
    evidence(f).barDecisionBindings[0]!.closedAt = '2026-05-18T03:30:00Z';
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result.status).toBe('decision-windows-bound');
    if (result.status === 'decision-windows-bound')
      expect(result.barDecisionBindings[0]).toMatchObject({
        closedAt: '2026-05-18T03:30:00Z',
        nextTradingDate: '2026-05-19',
        nextOpenedAt: '2026-05-19T01:30:00Z',
      });
  });

  it('同一瞬时的 offset 声明等价，保持原始 decisionAt 文本', async () => {
    const f = await fixture();
    const claim = evidence(f).barDecisionBindings[0]!;
    claim.decisionAt = '2026-05-18T15:00:00+08:00';
    claim.closedAt = '2026-05-18T15:00:00+08:00';
    claim.nextOpenedAt = '2026-05-19T09:30:00+08:00';
    const result = bindMarketPitDailyDecisionWindowsV3(f);
    expect(result.status).toBe('decision-windows-bound');
    if (result.status === 'decision-windows-bound')
      expect(result.barDecisionBindings[0]!.decisionAt).toBe(f.input.response.bars[0]!.availableAt);
  });

  it('拒绝未支持的日历模型', async () => {
    const f = await fixture();
    const calendar = evidence(f).calendars[0]!;
    calendar.timezone = 'Etc/GMT-8';
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({
      status: 'unavailable',
      reason: 'calendar-model-unsupported',
    });
  });

  it('归档已绑定标记不能掩盖错标的或非 Bar 内容篡改', async () => {
    const f = await fixture();
    f.content.archives[0]!.request.symbol = '510300.SH';
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({
      status: 'unavailable',
      reason: 'archive-binding-mismatch',
    });
    const other = await fixture();
    other.content.archives[0]!.response.sourcePriceBasis.observedAt = '2026-05-18T07:00:00.001Z';
    expect(bindMarketPitDailyDecisionWindowsV3(other)).toEqual({
      status: 'unavailable',
      reason: 'archive-binding-mismatch',
    });
  });
});

describe('逐 Bar 清单与拒绝边界', () => {
  it('输入观察晚于冻结一微秒由清单 Schema 提前拒绝为 input-mismatch', async () => {
    const f = await fixture();
    f.input.response.sourcePriceBasis.observedAt = '2026-05-21T08:00:00.000001Z';
    f.content.proof.sourcePriceBasis.observedAt = f.input.response.sourcePriceBasis.observedAt;
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({
      status: 'unavailable',
      reason: 'input-mismatch',
    });
  });

  it('未知解析异常返回稳定 clock-invalid，不泄露任意错误文本', async () => {
    const f = await fixture();
    f.sourceTimes.bindings[0]!.sourceObservedAt =
      f.content.archives[0]!.response.sourcePriceBasis.observedAt = 'invalid';
    expect(bindMarketPitDailyDecisionWindowsV3(f)).toEqual({
      status: 'unavailable',
      reason: 'clock-invalid',
    });
  });

  it('未来后继开盘可以晚于 dataAsOf', async () => {
    const f = await fixture();
    f.input.dataAsOf = f.content.proof.dataAsOf = '2026-05-20T07:02:00Z';
    for (const item of [...evidence(f).originalEvidence, ...evidence(f).calendars])
      item.acquiredAt = '2026-05-20T07:02:00Z';
    expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('decision-windows-bound');
  });

  it.each(['decisionAt', 'closedAt', 'nextOpenedAt', 'tradingDate', 'nextTradingDate'] as const)(
    '拒绝自报 %s',
    async (field) => {
      const f = await fixture();
      const claim = evidence(f).barDecisionBindings[0]!;
      if (field === 'tradingDate' || field === 'nextTradingDate') claim[field] = '2026-05-20';
      else claim[field] = '2026-05-18T05:00:00Z';
      expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('unavailable');
    },
  );

  it.each([
    'missing-last',
    'gap',
    'overlap',
    'midnight',
    'wrong-utc',
    'duplicate',
    'scope',
    'unbound',
  ] as const)('拒绝日历 %s', async (kind) => {
    const f = await fixture();
    const calendar = evidence(f).calendars[0]!;
    if (kind === 'missing-last') {
      calendar.dateStates.pop();
      calendar.historicalRange.end = '2026-05-20';
    } else if (kind === 'gap') calendar.dateStates.splice(1, 1);
    else if (kind === 'overlap') calendar.dateStates[0]!.sessions[1]!.startMinute = 680;
    else if (kind === 'midnight') calendar.dateStates[0]!.sessions[1]!.endMinute = 1440;
    else if (kind === 'wrong-utc')
      calendar.dateStates[0]!.sessions[1]!.closedAt = '2026-05-18T08:00:00Z';
    else if (kind === 'duplicate') f.calendars = [...f.calendars, f.calendars[0]!];
    else if (kind === 'scope') calendar.symbolScope = ['510300.SH'];
    else f.calendars = [];
    expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('unavailable');
  });

  it.each([
    'v1',
    'source-order',
    'source-count',
    'archive-duplicate',
    'archive-bar',
    'witness',
    'ref-order',
    'bar-incomplete',
    'calendar-late',
    'revision-late',
    'acquired-late',
  ] as const)('拒绝输入/证据 %s', async (kind) => {
    const f = await fixture();
    const ev = evidence(f);
    if (kind === 'v1') {
      const legacy = { ...f.content.proof };
      Reflect.deleteProperty(legacy, 'historicalDecisionWindow');
      f.content.proof = { ...legacy, contractVersion: 1 };
    } else if (kind === 'source-order') f.sourceTimes.bindings.reverse();
    else if (kind === 'source-count') f.sourceTimes.bindings.pop();
    else if (kind === 'archive-duplicate') f.content.archives.push(f.content.archives[0]!);
    else if (kind === 'archive-bar') f.content.archives[0]!.response.bars[0]!.close += 1;
    else if (kind === 'witness') ev.sourceWitnesses[0]!.completeResponseHash = hash('f');
    else if (kind === 'ref-order') f.content.proof.barArchives.reverse();
    else if (kind === 'bar-incomplete') f.input.response.bars[0]!.completionStatus = 'incomplete';
    else if (kind === 'calendar-late') {
      ev.calendars[0]!.knownAvailableAt = '2026-05-18T07:00:00.000001Z';
      f.calendars[0]!.knownAvailableAt = ev.calendars[0]!.knownAvailableAt;
    } else if (kind === 'revision-late')
      ev.sourceWitnesses[0]!.revisionKnownAvailableAt = '2026-05-18T07:00:00.000001Z';
    else ev.originalEvidence[0]!.acquiredAt = '2026-05-21T08:00:00.000001Z';
    expect(bindMarketPitDailyDecisionWindowsV3(f).status).toBe('unavailable');
  });
});
