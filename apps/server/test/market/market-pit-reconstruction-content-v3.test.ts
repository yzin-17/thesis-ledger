import { describe, expect, it } from 'vitest';
import { bindMarketPitArchiveContentV3 } from '../../src/market/market-pit-reconstruction-content-v3.js';
import { marketWindowSeriesVersionV3 } from '../../src/market/market-frozen-window-v3.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

describe('实际不可变归档内容绑定', () => {
  it('真实 repository 身份/摘要读回后冻结去重归档，但迟抓取内容不取得 PIT 资格', async () => {
    const f = await pitReconstructionFixture();
    const original = structuredClone({ ...f.input, proof: f.proof });
    const result = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(result.status).toBe('archives-bound');
    expect(result).not.toHaveProperty('eligible');
    expect(result).not.toHaveProperty('verified');
    expect(f.findUnique).toHaveBeenCalledTimes(1);
    if (result.status !== 'archives-bound') throw new Error('缺归档');
    expect(result.archives).toHaveLength(1);
    expect(result.archives[0]!.evidence.fetchedAt).toBe('2026-05-20T07:02:00.000Z');
    expect(result.archives[0]!.response).toEqual(f.input.response);
    expect({ ...f.input, proof: f.proof }).toEqual(original);
    f.rows.get(f.evidence.identityFingerprint)!.fetchedAt = new Date('2030-01-01');
    expect(result.archives[0]!.evidence.fetchedAt).toBe('2026-05-20T07:02:00.000Z');
  });

  it('缺归档拒绝，不能把字符串引用当事实', async () => {
    const f = await pitReconstructionFixture();
    f.rows.clear();
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-missing' });
  });

  it.each(['read-error', 'payload-change', 'hash-change'] as const)('拒绝 %s，失败关闭且不补投/生成归档', async kind => {
    const f = await pitReconstructionFixture();
    const row = f.rows.get(f.evidence.identityFingerprint)!;
    if (kind === 'read-error') f.findUnique.mockRejectedValueOnce(new Error('offline'));
    else if (kind === 'payload-change') row.completeResponse = { corrupt: true };
    else row.completeResponseHash = '0'.repeat(64);
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-invalid' });
    expect(f.create).toHaveBeenCalledTimes(1);
  });

  it('即使清单同意伪造版本，仍重新派生实际输入身份', async () => {
    const f = await pitReconstructionFixture();
    f.input.seriesVersion = f.proof.seriesVersion = `market-series-v1:identified:${'a'.repeat(64)}`;
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'input-mismatch' });
    expect(f.findUnique).not.toHaveBeenCalled();
  });

  it.each(['source', 'symbol', 'revision', 'anchor', 'volume', 'request-window'] as const)('拒绝实际归档的 %s 错配', async kind => {
    const f = await pitReconstructionFixture();
    const other = structuredClone(f.input);
    if (kind === 'source') {
      other.request.routeTarget.upstreamSource = other.response.provenance.upstreamSource = 'other-source';
    } else if (kind === 'symbol') {
      other.request.symbol = other.response.symbol = other.response.coverageProof!.listing.symbol = '510300.SH';
    } else if (kind === 'revision') other.response.sourcePriceBasis.revision = { origin: 'provider', id: 'v2' };
    else if (kind === 'anchor') other.response.sourcePriceBasis.anchor = '2026-05-19';
    else if (kind === 'volume') other.response.sourcePriceBasis.volumeBasis = 'original';
    else other.response.sourcePriceBasis.basisScope = 'request-window';
    f.pointTo(await f.record(other));
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-scope-mismatch' });
  });

  it.each(['open', 'amount', 'availableAt', 'missing'] as const)('摘要合法但 Bar 的 %s 不同仍拒绝', async kind => {
    const f = await pitReconstructionFixture();
    const other = structuredClone(f.input);
    if (kind === 'open') other.response.bars[0]!.open = 1.013;
    else if (kind === 'amount') other.response.bars[0]!.amount! += 1;
    else if (kind === 'availableAt') other.response.bars[0]!.availableAt = '2026-05-18T07:00:01.000Z';
    else {
      other.response.bars.shift();
      other.request.start = other.response.coverage.requestedStart = '2026-05-19';
      other.response.coverage.actualStart = other.response.bars[0]!.timestamp;
      other.response.coverageProof!.window.requestedStart = '2026-05-19';
      other.response.coverageProof!.calendar.expectedSessionDates.shift();
    }
    other.response.inputFingerprint = `alternate-${kind}`;
    f.pointTo(await f.record(other));
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-bar-mismatch' });
  });

  it.each(['fetch', 'observation'] as const)('归档 %s 晚于冻结截点时拒绝', async kind => {
    const f = await pitReconstructionFixture();
    const other = structuredClone(f.input);
    if (kind === 'observation') other.response.sourcePriceBasis.observedAt = '2026-05-22T00:00:00.000Z';
    f.pointTo(await f.record(other, new Date(kind === 'fetch' ? '2026-05-22T01:00:00.000Z' : '2026-05-21T07:00:00.000Z')));
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-future' });
  });

  it('v1 实际归档观察晚于冻结截点一微秒也拒绝', async () => {
    const f = await pitReconstructionFixture();
    const other = structuredClone(f.input);
    other.response.sourcePriceBasis.observedAt = '2026-05-21T08:00:00.000001Z';
    other.response.inputFingerprint = 'archive-observation-after-cutoff-microsecond';
    f.pointTo(await f.record(other, new Date('2026-05-21T08:00:00.000Z')));
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows)).toEqual({
      status: 'unavailable',
      reason: 'archive-future',
    });
  });

  it('同坐标不同观察时间可内容绑定，原观察时刻仍保留', async () => {
    const f = await pitReconstructionFixture();
    const other = structuredClone(f.input);
    other.response.sourcePriceBasis.observedAt = '2026-05-20T07:01:01.000Z';
    other.response.inputFingerprint = 'new-observation';
    f.pointTo(await f.record(other));
    const result = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(result.status).toBe('archives-bound');
    if (result.status === 'archives-bound') {
      expect(result.archives[0]!.response.sourcePriceBasis.observedAt).toBe('2026-05-20T07:01:01.000Z');
    }
  });

  it('相同供应商坐标可从多个实际完整日窗口绑定，逐窗口独立读取并冻结', async () => {
    const f = await pitReconstructionFixture();
    for (const [index, bar] of f.input.response.bars.entries()) {
      const other = structuredClone(f.input);
      const day = bar.timestamp.slice(0, 10);
      other.request.start = other.request.end = day;
      other.response.bars = [bar];
      other.response.coverage = { requestedStart: day, requestedEnd: day, actualStart: bar.timestamp,
        actualEnd: bar.timestamp, hasMoreBefore: false, latestCompleteTradingDate: day };
      other.response.coverageProof!.window.requestedStart = other.response.coverageProof!.window.requestedEnd = day;
      other.response.coverageProof!.calendar.expectedSessionDates = [day];
      other.response.inputFingerprint = `daily-${day}`;
      const archive = await f.record(other);
      f.proof.barArchives[index]!.windowIdentityFingerprint = archive.identityFingerprint;
      f.proof.barArchives[index]!.completeResponseHash = archive.completeResponseHash!;
    }
    const result = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    expect(result.status).toBe('archives-bound');
    if (result.status === 'archives-bound') expect(result.archives).toHaveLength(3);
    expect(f.findUnique).toHaveBeenCalledTimes(3);
  });

  it('request-window 基准不能使用不同请求范围的合法归档', async () => {
    const f = await pitReconstructionFixture();
    f.input.response.sourcePriceBasis.basisScope = 'request-window';
    f.input.seriesVersion = f.proof.seriesVersion = marketWindowSeriesVersionV3(f.input.request, f.input.response);
    f.proof.sourcePriceBasis = structuredClone(f.input.response.sourcePriceBasis);
    const other = structuredClone(f.input);
    other.request.start = other.response.coverage.requestedStart = '2026-05-19';
    other.response.bars.shift();
    other.response.coverage.actualStart = other.response.bars[0]!.timestamp;
    other.response.coverageProof!.window.requestedStart = '2026-05-19';
    other.response.coverageProof!.calendar.expectedSessionDates.shift();
    other.response.inputFingerprint = 'different-request-window';
    f.pointTo(await f.record(other));
    expect(await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows))
      .toEqual({ status: 'unavailable', reason: 'archive-scope-mismatch' });
  });
});
