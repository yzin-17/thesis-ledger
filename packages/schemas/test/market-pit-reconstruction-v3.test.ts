import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bindMarketPitReconstructionProofV3,
  bindMarketPitReconstructionManifestV3,
  marketPitReconstructionManifestV3Schema,
  marketPitReconstructionProofV2Schema,
  marketPitReconstructionProofV3Schema,
} from '../src/market-pit-reconstruction-v3.js';
import {
  marketDataBarSeriesResponseV3Schema,
  marketDataBarSeriesRequestV3Schema,
} from '../src/market-data-wire-v3.js';

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

describe('历史重建清单合同与输入绑定', () => {
  it('仅输出输入引用已绑定，不把缺少实际归档核验的清单标为 PIT 通过', () => {
    const input = fixture();
    const original = structuredClone(input);
    const result = bindMarketPitReconstructionProofV3(input);
    expect(result).toEqual({ status: 'bound', proof: input.proof });
    expect(result).not.toHaveProperty('eligible');
    expect(result).not.toHaveProperty('verified');
    expect(input).toEqual(original);
  });

  it.each(['fetchedAt', 'prices', 'availableAt'])('拒绝客户端自报的归档字段 %s', (field) => {
    const input = fixture();
    const injected = {
      ...input.proof,
      barArchives: input.proof.barArchives.map((archive, index) =>
        index === 0 ? { ...archive, [field]: '2020-01-01T00:00:00.000Z' } : archive,
      ),
    };
    expect(bindMarketPitReconstructionProofV3({ ...input, proof: injected })).toEqual({
      status: 'unavailable',
      reason: 'invalid-proof',
    });
  });

  it.each(['symbol', 'window', 'target', 'seriesVersion', 'inputFingerprint', 'dataAsOf'] as const)(
    '拒绝清单范围 %s 与实际输入不同',
    (field) => {
      const input = fixture();
      const proof = structuredClone(input.proof);
      if (field === 'symbol') proof.symbol = '510300.SH';
      else if (field === 'window') proof.window.end = '2026-05-22';
      else if (field === 'target') proof.target.routeIndex = 1;
      else if (field === 'seriesVersion')
        proof.seriesVersion = `market-series-v1:identified:${'d'.repeat(64)}`;
      else if (field === 'inputFingerprint') proof.inputFingerprint = 'different-content';
      else proof.dataAsOf = '2026-05-22T08:00:00.000Z';
      expect(bindMarketPitReconstructionProofV3({ ...input, proof })).toEqual({
        status: 'unavailable',
        reason: 'scope-mismatch',
      });
    },
  );

  it('拒绝同样 qfq 标签但不同精确 RouteKey 的清单', () => {
    const input = fixture();
    input.proof.routeKey.assetType = 'STOCK';
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'scope-mismatch',
    });
  });

  it('实际响应目标与请求目标不一致时不接受清单', () => {
    const input = fixture();
    input.response.provenance.upstreamSource = 'other-source';
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'scope-mismatch',
    });
  });

  it('没有固定目标的请求不能消费精确重建清单', () => {
    const input = fixture();
    delete input.request.routeTarget;
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'scope-mismatch',
    });
  });

  it.each(['anchor', 'observedAt', 'revision', 'volumeBasis'] as const)(
    '完整来源价格事实 %s 不同时拒绝',
    (field) => {
      const input = fixture();
      if (field === 'anchor') input.proof.sourcePriceBasis.anchor = '2026-05-19';
      else if (field === 'observedAt')
        input.proof.sourcePriceBasis.observedAt = '2026-05-20T08:00:00.000Z';
      else if (field === 'revision')
        input.proof.sourcePriceBasis.revision = {
          origin: 'provider',
          id: 'different-provider-revision',
        };
      else input.proof.sourcePriceBasis.volumeBasis = 'original';
      expect(bindMarketPitReconstructionProofV3(input)).toEqual({
        status: 'unavailable',
        reason: 'price-basis-mismatch',
      });
    },
  );

  it.each(['local-observation', 'unknown'] as const)('严格清单不接受 %s 修订', (kind) => {
    const input = fixture();
    input.proof.sourcePriceBasis.revision =
      kind === 'unknown'
        ? { origin: 'provider', id: 'api:unknown:v1' }
        : { origin: 'local-observation', contentHash: 'a'.repeat(64) };
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'invalid-proof',
    });
  });

  it.each(['missing', 'extra', 'wrong-time'] as const)('逐 Bar 引用为 %s 时不接受', (kind) => {
    const input = fixture();
    if (kind === 'missing') input.proof.barArchives.pop();
    else if (kind === 'extra')
      input.proof.barArchives.push({
        ...input.proof.barArchives.at(-1)!,
        timestamp: '2026-05-21T07:00:00.000Z',
      });
    else input.proof.barArchives[0]!.timestamp = '2026-05-18T06:00:00.000Z';
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'bar-archive-mismatch',
    });
  });

  it.each(['reversed', 'duplicate-time', 'conflicting-hash'] as const)(
    '拒绝 %s 的不可变引用清单',
    (kind) => {
      const input = fixture();
      if (kind === 'reversed') input.proof.barArchives.reverse();
      else if (kind === 'duplicate-time')
        input.proof.barArchives[1]!.timestamp = input.proof.barArchives[0]!.timestamp;
      else
        input.proof.barArchives[1]!.windowIdentityFingerprint =
          input.proof.barArchives[0]!.windowIdentityFingerprint;
      expect(bindMarketPitReconstructionProofV3(input)).toEqual({
        status: 'unavailable',
        reason: 'invalid-proof',
      });
    },
  );

  it('同一个完整窗口可以提供多个 Bar，但响应摘要必须相同', () => {
    const input = fixture();
    const first = input.proof.barArchives[0]!;
    input.proof.barArchives.forEach((archive) => {
      archive.windowIdentityFingerprint = first.windowIdentityFingerprint;
      archive.completeResponseHash = first.completeResponseHash;
    });
    expect(bindMarketPitReconstructionProofV3(input).status).toBe('bound');
  });

  it.each(['observation', 'visibility'] as const)('拒绝晚于冻结截点的 %s', (kind) => {
    const input = fixture();
    if (kind === 'observation') {
      input.response.sourcePriceBasis.observedAt = '2026-05-22T00:00:00.000Z';
      input.proof.sourcePriceBasis.observedAt = input.response.sourcePriceBasis.observedAt;
    } else input.response.bars[0]!.availableAt = '2026-05-22T00:00:00.000Z';
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'future-fact',
    });
  });

  it('逐 Bar 归档引用相差一微秒时不视为相同瞬时', () => {
    const input = fixture();
    input.proof.barArchives[0]!.timestamp = '2026-05-18T07:00:00.000001Z';
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'bar-archive-mismatch',
    });
  });

  it.each(['observation', 'visibility'] as const)('%s 晚于冻结截点一微秒也拒绝', (kind) => {
    const input = fixture();
    const late = '2026-05-21T08:00:00.000001Z';
    if (kind === 'observation') {
      input.response.sourcePriceBasis.observedAt = late;
      input.proof.sourcePriceBasis.observedAt = late;
    } else input.response.bars[0]!.availableAt = late;
    expect(bindMarketPitReconstructionProofV3(input)).toEqual({
      status: 'unavailable',
      reason: 'future-fact',
    });
  });

  it('同一瞬时的明确时区偏移不被误判为未来', () => {
    const input = fixture();
    input.response.sourcePriceBasis.observedAt = '2026-05-21T16:00:00+08:00';
    input.proof.sourcePriceBasis.observedAt = input.response.sourcePriceBasis.observedAt;
    expect(bindMarketPitReconstructionProofV3(input).status).toBe('bound');
  });
});

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

describe('重建清单 v2 与旧 v1 必要条件兼容', () => {
  it('联合 parser/binder 保留 v1 必要条件，旧 parser 不隐式接受 v2', () => {
    const v1 = fixture();
    expect(marketPitReconstructionManifestV3Schema.parse(v1.proof)).toEqual(v1.proof);
    expect(bindMarketPitReconstructionManifestV3(v1)).toEqual(
      bindMarketPitReconstructionProofV3(v1),
    );
    expect(marketPitReconstructionProofV3Schema.safeParse(v2Fixture().proof).success).toBe(false);
  });
  it('v2 仍只返回 bound，后继开盘可晚于 dataAsOf，不需要后继价格', () => {
    const input = v2Fixture();
    input.proof.dataAsOf = '2026-05-20T08:00:00Z';
    input.dataAsOf = input.proof.dataAsOf;
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'bound',
      proof: input.proof,
    });
    expect(
      input.proof.historicalDecisionWindow.barDecisionBindings.at(-1)!.nextOpenedAt >
        input.dataAsOf,
    ).toBe(true);
    expect(bindMarketPitReconstructionManifestV3(input)).not.toHaveProperty('eligible');
  });
  it.each(['missing', 'hash', 'timestamp', 'order', 'unused-witness', 'scope'] as const)(
    '拒绝 %s 的 v2 原始引用绑定',
    (kind) => {
      const input = v2Fixture();
      const evidence = input.proof.historicalDecisionWindow;
      if (kind === 'missing') evidence.barDecisionBindings.pop();
      else if (kind === 'hash') input.proof.barArchives[0]!.completeResponseHash = 'd'.repeat(64);
      else if (kind === 'timestamp')
        evidence.barDecisionBindings[0]!.timestamp = '2026-05-18T06:59:59Z';
      else if (kind === 'order') evidence.barDecisionBindings.reverse();
      else if (kind === 'unused-witness')
        evidence.sourceWitnesses[0]!.windowIdentityFingerprint = 'e'.repeat(64);
      else evidence.calendars[0]!.symbolScope = ['510300.SH'];
      expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
        status: 'unavailable',
        reason: 'invalid-proof',
      });
    },
  );
  it('decisionAt 必须等于实际输入 Bar 未修改的 availableAt', () => {
    const input = v2Fixture();
    input.proof.historicalDecisionWindow.barDecisionBindings[0]!.decisionAt =
      '2026-05-18T07:01:00Z';
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'unavailable',
      reason: 'bar-archive-mismatch',
    });
  });
  it('已获取证据晚于 dataAsOf 时拒绝，不能借声明历史发布日期放行', () => {
    const input = v2Fixture();
    input.proof.historicalDecisionWindow.originalEvidence[0]!.acquiredAt = '2026-05-22T00:00:00Z';
    expect(bindMarketPitReconstructionManifestV3(input)).toEqual({
      status: 'unavailable',
      reason: 'invalid-proof',
    });
  });
  it('缺 historicalDecisionWindow 的 v2 及超过外层字节预算的清单拒绝', () => {
    expect(
      marketPitReconstructionManifestV3Schema.safeParse({ ...fixture().proof, contractVersion: 2 })
        .success,
    ).toBe(false);
    expect(
      marketPitReconstructionManifestV3Schema.safeParse({
        ...fixture().proof,
        extra: 'x'.repeat(32 * 1024 * 1024),
      }).success,
    ).toBe(false);
  });
});
