import { describe, expect, it } from 'vitest';
import { marketPitReconstructionProofV2Schema } from '@thesis-ledger/schemas';
import { bindMarketPitArchiveContentV3 } from '../../src/market/market-pit-reconstruction-content-v3.js';
import { bindMarketPitSourceTimesV3 } from '../../src/market/market-pit-reconstruction-source-times-v3.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

/** 仅构造结构必要证据；原文与日历未获得真实历史资格。 */
const v2Fixture = async () => {
  const f = await pitReconstructionFixture();
  await f.partitionAtOriginalObservation();
  const input = { ...f.input, proof: f.proof };
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
  return { ...f, input: f.input, proof };
};

describe('v2 清单的实际归档内容必要绑定', () => {
  it('读取实际完整归档，保留 v2，并贯通来源时钟但不授予最终资格', async () => {
    const f = await v2Fixture();
    const original = structuredClone({ ...f.input, proof: f.proof });
    const content = await bindMarketPitArchiveContentV3(original, f.windows);
    expect(content.status).toBe('archives-bound');
    if (content.status !== 'archives-bound') throw new Error('缺归档');
    expect(content.proof).toEqual(f.proof);
    expect(content.proof.contractVersion).toBe(2);
    expect(content.archives).toHaveLength(3);
    expect(f.findUnique).toHaveBeenCalledTimes(3);
    expect(bindMarketPitSourceTimesV3(content).status).toBe('source-times-bound');
    expect(content).not.toHaveProperty('eligible');
    expect(content).not.toHaveProperty('verified');
    expect({ ...f.input, proof: f.proof }).toEqual(original);
  });

  it.each(['input', 'route', 'historical-reference', 'decision', 'cutoff'] as const)(
    '在读取归档前拒绝 %s 错配',
    async (kind) => {
      const f = await v2Fixture();
      if (kind === 'input') f.proof.inputFingerprint = 'other-input';
      else if (kind === 'route') f.proof.target.upstreamSource = 'other-source';
      else if (kind === 'historical-reference')
        f.proof.historicalDecisionWindow.barDecisionBindings[0]!.completeResponseHash = 'b'.repeat(
          64,
        );
      else if (kind === 'decision')
        f.proof.historicalDecisionWindow.barDecisionBindings[0]!.decisionAt =
          '2026-05-18T07:02:00.000Z';
      else f.input.dataAsOf = '2026-05-17T00:00:00.000Z';
      expect(
        await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows),
      ).toEqual({ status: 'unavailable', reason: 'input-mismatch' });
      expect(f.findUnique).not.toHaveBeenCalled();
    },
  );

  it.each(['missing', 'hash', 'bar', 'scope', 'fetch'] as const)(
    '实际归档 %s 不满足时失败关闭',
    async (kind) => {
      const f = await v2Fixture();
      const ref = f.proof.barArchives[0]!;
      const row = f.rows.get(ref.windowIdentityFingerprint)!;
      let reason = 'archive-invalid';
      if (kind === 'missing') {
        f.rows.delete(ref.windowIdentityFingerprint);
        reason = 'archive-missing';
      } else if (kind === 'hash') row.completeResponseHash = 'b'.repeat(64);
      else if (kind === 'fetch') {
        row.fetchedAt = new Date('2026-05-22T00:00:00.000Z');
        reason = 'archive-future';
      } else {
        const other = structuredClone(f.input);
        if (kind === 'bar') other.response.bars[0]!.open += 0.001;
        else
          other.request.routeTarget.upstreamSource = other.response.provenance.upstreamSource =
            'other-source';
        const archive = await f.record(other);
        ref.windowIdentityFingerprint = archive.identityFingerprint;
        ref.completeResponseHash = archive.completeResponseHash!;
        Object.assign(f.proof.historicalDecisionWindow.barDecisionBindings[0]!, ref);
        Object.assign(f.proof.historicalDecisionWindow.sourceWitnesses[0]!, {
          windowIdentityFingerprint: ref.windowIdentityFingerprint,
          completeResponseHash: ref.completeResponseHash,
        });
        reason = kind === 'bar' ? 'archive-bar-mismatch' : 'archive-scope-mismatch';
      }
      expect(
        await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows),
      ).toEqual({ status: 'unavailable', reason });
    },
  );

  it('旧 v1 仍读取完整归档并仅返回 archives-bound', async () => {
    const f = await pitReconstructionFixture();
    const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(content.status).toBe('archives-bound');
    if (content.status === 'archives-bound') expect(content.proof.contractVersion).toBe(1);
  });

  it.each([
    { clock: '2026-05-21T08:00:00.000000Z', status: 'archives-bound' },
    { clock: '2026-05-21T08:00:00.000001Z', status: 'archives-bound' },
    { clock: '2026-05-21T16:00:00.000001+08:00', status: 'archives-bound' },
    { clock: '2026-05-21T08:00:00.000002Z', status: 'unavailable' },
    { clock: '2026-05-21T08:00:00.000001-00:00', status: 'unavailable' },
  ])('实际归档观察 $clock 的精确截点结果为 $status', async ({ clock, status }) => {
    const f = await v2Fixture();
    f.input.dataAsOf = f.proof.dataAsOf = '2026-05-21T08:00:00.000001Z';
    const archiveInput = structuredClone(f.input);
    archiveInput.response.inputFingerprint = 'archive-observation-after-cutoff';
    archiveInput.response.sourcePriceBasis.observedAt = clock;
    const archive = await f.record(archiveInput);
    const ref = f.proof.barArchives[0]!;
    ref.windowIdentityFingerprint = archive.identityFingerprint;
    ref.completeResponseHash = archive.completeResponseHash!;
    Object.assign(f.proof.historicalDecisionWindow.barDecisionBindings[0]!, ref);
    Object.assign(f.proof.historicalDecisionWindow.sourceWitnesses[0]!, {
      windowIdentityFingerprint: ref.windowIdentityFingerprint,
      completeResponseHash: ref.completeResponseHash,
    });
    const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(content.status).toBe(status);
    if (content.status === 'unavailable') expect(content.reason).toBe('archive-future');
    expect(f.findUnique).toHaveBeenCalled();
  });

  it.each(['availability', 'timestamp'] as const)(
    '完整归档内未被本根输入引用的 Bar %s 晚一微秒也拒绝',
    async (kind) => {
      const f = await v2Fixture();
      f.input.dataAsOf = f.proof.dataAsOf = '2026-05-21T08:00:00.000001Z';
      const archiveInput = structuredClone(f.input);
      archiveInput.response.inputFingerprint = 'archive-extra-bar-after-cutoff';
      const late = '2026-05-21T08:00:00.000002Z';
      archiveInput.response.bars[2]!.availableAt = late;
      if (kind === 'timestamp') {
        archiveInput.response.bars[2]!.timestamp = late;
        archiveInput.request.end = '2026-05-21';
        archiveInput.response.coverage.requestedEnd = '2026-05-21';
        archiveInput.response.coverage.actualEnd = late;
        archiveInput.response.coverage.latestCompleteTradingDate = '2026-05-21';
        archiveInput.response.coverageProof.window.requestedEnd = '2026-05-21';
        archiveInput.response.coverageProof.calendar.expectedSessionDates[2] = '2026-05-21';
      }
      const archive = await f.record(archiveInput);
      const ref = f.proof.barArchives[0]!;
      ref.windowIdentityFingerprint = archive.identityFingerprint;
      ref.completeResponseHash = archive.completeResponseHash!;
      Object.assign(f.proof.historicalDecisionWindow.barDecisionBindings[0]!, ref);
      Object.assign(f.proof.historicalDecisionWindow.sourceWitnesses[0]!, {
        windowIdentityFingerprint: ref.windowIdentityFingerprint,
        completeResponseHash: ref.completeResponseHash,
      });
      const content = await bindMarketPitArchiveContentV3(
        { ...f.input, proof: f.proof },
        f.windows,
      );
      expect(content.status).toBe('unavailable');
      if (content.status === 'unavailable') expect(content.reason).toBe('archive-future');
    },
  );

  it.each([
    { fetchedAt: '2026-05-21T08:00:00.000Z', status: 'archives-bound' },
    { fetchedAt: '2026-05-21T08:00:00.001Z', status: 'unavailable' },
  ])('保留实际 Date 抓取精度：$fetchedAt → $status', async ({ fetchedAt, status }) => {
    const f = await v2Fixture();
    f.input.dataAsOf = f.proof.dataAsOf = '2026-05-21T08:00:00.000001Z';
    f.rows.get(f.proof.barArchives[0]!.windowIdentityFingerprint)!.fetchedAt = new Date(fetchedAt);
    const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(content.status).toBe(status);
    if (content.status === 'archives-bound')
      expect(content.archives[0]!.evidence.fetchedAt).toBe(fetchedAt);
    else expect(content.reason).toBe('archive-future');
  });

  it('旧 v1 归档观察晚于截点一微秒时也拒绝', async () => {
    const f = await pitReconstructionFixture();
    f.input.dataAsOf = f.proof.dataAsOf = '2026-05-21T08:00:00.000001Z';
    const archiveInput = structuredClone(f.input);
    archiveInput.response.inputFingerprint = 'legacy-archive-clock';
    archiveInput.response.sourcePriceBasis.observedAt = '2026-05-21T08:00:00.000002Z';
    f.pointTo(await f.record(archiveInput));
    const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(content.status).toBe('unavailable');
    if (content.status === 'unavailable') expect(content.reason).toBe('archive-future');
  });
});
