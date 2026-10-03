import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bindMarketPitReconstructionManifestV3,
  marketPitReconstructionProofV2Schema,
  marketPitReconstructionProofV3Schema,
  marketPitReconstructionManifestV3Schema,
} from '../src/market-pit-reconstruction-v3.js';
import {
  marketDataBarSeriesResponseV3Schema,
  marketDataBarSeriesRequestV3Schema,
} from '../src/market-data-wire-v3.js';
import { marketPitHistoricalDecisionWindowV3Schema } from '../src/market-pit-historical-evidence-v1.js';
import {
  parseMarketPitEvidenceInstantV1,
  compareMarketPitEvidenceInstantsV1,
} from '../src/index.js';

const fixture = () => {
  const response = marketDataBarSeriesResponseV3Schema.parse(
    JSON.parse(
      readFileSync(
        new URL('../fixtures/market-data-v3.response.etf-qfq.json', import.meta.url),
        'utf8',
      ),
    ),
  );
  response.sourcePriceBasis.anchor = '2026-05-18';
  const request = marketDataBarSeriesRequestV3Schema.parse({
    contractVersion: 3,
    requestId: response.requestId,
    symbol: response.symbol,
    routeKey: response.routeKey,
    routeTarget: {
      providerId: response.provenance.providerId,
      upstreamSource: response.provenance.upstreamSource,
      routeIndex: response.provenance.routeIndex,
    },
    start: response.coverage.requestedStart,
    end: response.coverage.requestedEnd,
  });
  const dataAsOf = '2026-05-21T08:00:00.000Z';
  const seriesVersion = `market-series-v1:identified:${'a'.repeat(64)}`;
  const proof = marketPitReconstructionProofV3Schema.parse({
    contractVersion: 1,
    kind: 'market-pit-reconstruction',
    symbol: request.symbol,
    routeKey: request.routeKey,
    target: request.routeTarget,
    window: { start: request.start, end: request.end },
    seriesVersion,
    inputFingerprint: response.inputFingerprint,
    sourcePriceBasis: response.sourcePriceBasis,
    dataAsOf,
    barArchives: response.bars.map((bar, index) => ({
      timestamp: bar.timestamp,
      windowIdentityFingerprint: `${'b'.repeat(63)}${index}`,
      completeResponseHash: `${'c'.repeat(63)}${index}`,
    })),
  });
  return { proof, request, response, dataAsOf, seriesVersion };
};

const v2Fixture = () => {
  const input = fixture();
  const knownAvailableAt = '2026-01-01T00:00:00Z';
  const hash = 'a'.repeat(64);
  const dates = ['2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21'];
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
  const proof = marketPitReconstructionProofV2Schema.parse({
    ...input.proof,
    contractVersion: 2,
    historicalDecisionWindow: {
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
          symbolScope: [input.request.symbol],
          venueBindingEvidenceIds: ['publication'],
          historicalRange: { start: dates[0], end: dates.at(-1) },
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
      sourceWitnesses: input.proof.barArchives.map(
        ({ windowIdentityFingerprint, completeResponseHash }, index) => ({
          windowIdentityFingerprint,
          completeResponseHash,
          id: `witness-${index}`,
          captureEvidenceId: 'capture',
          revisionPublicationIds: ['publication'],
          revisionKnownAvailableAt: knownAvailableAt,
        }),
      ),
      barDecisionBindings: input.proof.barArchives.map((archive, index) => ({
        ...archive,
        calendarEvidenceId: 'calendar',
        sourceWitnessId: `witness-${index}`,
        tradingDate: dates[index],
        decisionAt: input.response.bars[index]!.availableAt,
        closedAt: `${dates[index]}T15:00:00+08:00`,
        nextTradingDate: dates[index + 1],
        nextOpenedAt: `${dates[index + 1]}T09:30:00+08:00`,
      })),
    },
  });
  return { ...input, proof };
};

describe('v2 历史证据精确瞬时边界', () => {
  it.each([
    ['123455', '123456'],
    ['123456788', '123456789'],
    ['1'.repeat(999) + '1', '1'.repeat(999) + '2'],
  ])('拒绝同一毫秒内不同 decisionAt/availableAt (%s)', (earlier, later) => {
    const input = v2Fixture();
    const evidence = input.proof.historicalDecisionWindow;
    input.response.bars[0]!.availableAt = `2026-05-18T07:01:00.${earlier}Z`;
    evidence.barDecisionBindings[0]!.decisionAt = `2026-05-18T07:01:00.${later}Z`;
    const original = structuredClone(input);
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'unavailable',
      reason: 'bar-archive-mismatch',
    });
    expect(input).toEqual(original);
  });

  it('等价 UTC/偏移与尾零通过并保留全部原始文本，仍只返回必要绑定', () => {
    const input = v2Fixture();
    input.response.bars[0]!.availableAt = '2026-05-18T07:01:00.123456789Z';
    input.proof.historicalDecisionWindow.barDecisionBindings[0]!.decisionAt =
      '2026-05-18T15:01:00.123456789000+08:00';
    const original = structuredClone(input);
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'bound',
      proof: input.proof,
    });
    expect(input).toEqual(original);
    expect(bindMarketPitReconstructionManifestV3(input)).not.toHaveProperty('eligible');
  });

  it.each(['original', 'calendar', 'revision', 'decision', 'observation', 'archive'] as const)(
    '冻结截点精确拒绝未来一纳秒的 %s',
    (field) => {
      const input = v2Fixture();
      const evidence = input.proof.historicalDecisionWindow;
      const cutoff = '2026-05-20T07:00:00.123456788Z';
      const future = '2026-05-20T07:00:00.123456789Z';
      input.proof.dataAsOf = cutoff;
      if (field === 'original') evidence.originalEvidence[0]!.acquiredAt = future;
      else if (field === 'calendar') evidence.calendars[0]!.acquiredAt = future;
      else if (field === 'revision')
        evidence.sourceWitnesses.at(-1)!.revisionKnownAvailableAt = future;
      else if (field === 'decision') evidence.barDecisionBindings.at(-1)!.decisionAt = future;
      else if (field === 'observation') input.proof.sourcePriceBasis.observedAt = future;
      else {
        input.proof.barArchives.at(-1)!.timestamp = future;
        evidence.barDecisionBindings.at(-1)!.timestamp = future;
      }
      expect(marketPitReconstructionProofV2Schema.safeParse(input.proof).success).toBe(false);
    },
  );

  it.each(['original', 'calendar'] as const)(
    '原文与日历 %s 的 known<=acquired 不截断微秒',
    (kind) => {
      const evidence = v2Fixture().proof.historicalDecisionWindow;
      const item = kind === 'original' ? evidence.originalEvidence[0]! : evidence.calendars[0]!;
      item.knownAvailableAt = '2026-01-01T00:00:00.123456Z';
      item.acquiredAt = '2026-01-01T00:00:00.123455Z';
      expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
    },
  );

  it.each(['calendar', 'revision'] as const)('%s 在决策后一纳秒可见时拒绝', (kind) => {
    const evidence = v2Fixture().proof.historicalDecisionWindow;
    evidence.barDecisionBindings[0]!.decisionAt = '2026-05-18T07:01:00.123456788Z';
    const future = '2026-05-18T07:01:00.123456789Z';
    if (kind === 'calendar') {
      evidence.calendars[0]!.knownAvailableAt = future;
      evidence.calendars[0]!.acquiredAt = future;
    } else evidence.sourceWitnesses[0]!.revisionKnownAvailableAt = future;
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
  });

  it('一纳秒收盘前拒绝，下一开盘前一纳秒允许，开盘相等拒绝', () => {
    const evidence = v2Fixture().proof.historicalDecisionWindow;
    const binding = evidence.barDecisionBindings[0]!;
    binding.decisionAt = '2026-05-18T06:59:59.999999999Z';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
    binding.decisionAt = '2026-05-19T01:29:59.999999999Z';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(true);
    binding.decisionAt = '2026-05-19T01:30:00Z';
    expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
  });

  it.each(['closedAt', 'nextOpenedAt'] as const)(
    '日历提供的 %s 与绑定相差一微秒时拒绝',
    (field) => {
      const evidence = v2Fixture().proof.historicalDecisionWindow;
      evidence.barDecisionBindings[0]![field] =
        field === 'closedAt' ? '2026-05-18T07:00:00.000001Z' : '2026-05-19T01:30:00.000001Z';
      expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
    },
  );

  it('实际 Bar 原始时间的亚毫秒差异不会被清单身份绑定掩盖', () => {
    const input = v2Fixture();
    input.response.bars[0]!.timestamp = '2026-05-18T07:00:00.000000001Z';
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'unavailable',
      reason: 'bar-archive-mismatch',
    });
  });

  it('Bar 时间晚于决策/实际 availableAt 一纳秒时拒绝', () => {
    const input = v2Fixture();
    const binding = input.proof.historicalDecisionWindow.barDecisionBindings[0]!;
    binding.timestamp = '2026-05-18T07:00:00.123456789Z';
    binding.decisionAt = '2026-05-18T07:00:00.123456788Z';
    input.proof.barArchives[0]!.timestamp = binding.timestamp;
    input.response.bars[0]!.timestamp = binding.timestamp;
    input.response.bars[0]!.availableAt = binding.decisionAt;
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'unavailable',
      reason: 'invalid-proof',
    });
  });

  it('原始 Bar 亚毫秒严格递增可通过，反序或等价偏移重复拒绝', () => {
    const input = v2Fixture();
    const evidence = input.proof.historicalDecisionWindow;
    evidence.barDecisionBindings[0]!.decisionAt = '2026-05-18T07:01:00Z';
    input.response.bars[0]!.availableAt = evidence.barDecisionBindings[0]!.decisionAt;
    for (let index = 0; index < input.proof.barArchives.length; index++) {
      const timestamp = `2026-05-18T07:00:00.12345${index}Z`;
      input.proof.barArchives[index]!.timestamp = timestamp;
      evidence.barDecisionBindings[index]!.timestamp = timestamp;
      input.response.bars[index]!.timestamp = timestamp;
    }
    expect(marketPitReconstructionProofV2Schema.safeParse(input.proof).success).toBe(true);
    expect(bindMarketPitReconstructionManifestV3(input).status).toBe('bound');
    input.proof.barArchives[1]!.timestamp = '2026-05-18T15:00:00.123450000+08:00';
    evidence.barDecisionBindings[1]!.timestamp = input.proof.barArchives[1]!.timestamp;
    expect(marketPitReconstructionProofV2Schema.safeParse(input.proof).success).toBe(false);
    input.proof.barArchives[1]!.timestamp = '2026-05-18T07:00:00.123449Z';
    evidence.barDecisionBindings[1]!.timestamp = input.proof.barArchives[1]!.timestamp;
    expect(marketPitReconstructionProofV2Schema.safeParse(input.proof).success).toBe(false);
  });

  it.each([
    '2026-05-18T07:00:00-00:00',
    '2026-02-30T07:00:00Z',
    '2026-05-18T07:00:00+24:00',
    `2026-05-18T07:00:00.${'0'.repeat(1025)}Z`,
  ])('非法或超限时刻由公开 safeParse 结构化拒绝 (%s)', (invalid) => {
    const cases: Array<(value: ReturnType<typeof v2Fixture>) => void> = [
      (value) => {
        value.proof.dataAsOf = invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.originalEvidence[0]!.acquiredAt = invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.calendars[0]!.acquiredAt = invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.calendars[0]!.dateStates[0]!.sessions[0]!.closedAt =
          invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.sourceWitnesses[0]!.revisionKnownAvailableAt = invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.barDecisionBindings[0]!.decisionAt = invalid;
      },
      (value) => {
        value.proof.historicalDecisionWindow.barDecisionBindings[0]!.timestamp = invalid;
      },
    ];
    for (const [index, mutate] of cases.entries()) {
      const input = v2Fixture();
      mutate(input);
      expect(() => marketPitReconstructionManifestV3Schema.safeParse(input.proof)).not.toThrow();
      expect(marketPitReconstructionManifestV3Schema.safeParse(input.proof).success).toBe(false);
      if (index > 0) {
        const evidence = input.proof.historicalDecisionWindow;
        expect(() => marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence)).not.toThrow();
        expect(marketPitHistoricalDecisionWindowV3Schema.safeParse(evidence).success).toBe(false);
      }
    }
  });

  it('公共协议原语支持 1024 位小数并拒绝非法真实日期与未知偏移', () => {
    const earlier = parseMarketPitEvidenceInstantV1(`2026-05-18T07:00:00.${'1'.repeat(1023)}1Z`);
    const later = parseMarketPitEvidenceInstantV1(`2026-05-18T15:00:00.${'1'.repeat(1023)}2+08:00`);
    expect(compareMarketPitEvidenceInstantsV1(earlier, later)).toBe(-1);
    expect(() => parseMarketPitEvidenceInstantV1('2026-02-29T00:00:00Z')).toThrow(
      'capture-clock-invalid',
    );
    expect(() => parseMarketPitEvidenceInstantV1('2026-05-18T07:00:00-00:00')).toThrow(
      'capture-clock-invalid',
    );
  });
});
