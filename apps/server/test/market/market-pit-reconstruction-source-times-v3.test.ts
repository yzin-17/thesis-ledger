import { describe, expect, it } from 'vitest';
import { bindMarketPitSourceTimesV3 } from '../../src/market/market-pit-reconstruction-source-times-v3.js';
import { bindMarketPitArchiveContentV3 } from '../../src/market/market-pit-reconstruction-content-v3.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

const fixture = async () => {
  const f = await pitReconstructionFixture();
  await f.partitionAtOriginalObservation();
  const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
  if (content.status !== 'archives-bound') throw new Error('归档夹具不可用');
  return { ...f, content };
};

describe('实际来源观察与 Server 抓取时钟绑定', () => {
  it.each([
    ['late', 'bar-observation-late'],
    ['fetch', 'archive-observation-order'],
    ['future-price', 'archive-future-at-observation'],
    ['future-visibility', 'archive-future-at-observation'],
    ['price-after-visibility', 'archive-clock-invalid'],
  ] as const)('精确拒绝一微秒差异 %s', async (kind, reason) => {
    const { content } = await fixture();
    const archive = content.archives[0]!;
    const bar = archive.response.bars[0]!;
    archive.response.sourcePriceBasis.observedAt = '2026-05-18T07:01:00.123456Z';
    archive.evidence.fetchedAt = '2026-05-18T07:01:00.123457Z';
    bar.availableAt = archive.response.sourcePriceBasis.observedAt;
    if (kind === 'late') bar.availableAt = '2026-05-18T07:01:00.123455Z';
    else if (kind === 'fetch') archive.evidence.fetchedAt = '2026-05-18T07:01:00.123455Z';
    else if (kind === 'future-price') {
      bar.timestamp = '2026-05-18T07:01:00.123457Z';
      bar.availableAt = bar.timestamp;
    } else if (kind === 'future-visibility') bar.availableAt = '2026-05-18T07:01:00.123457Z';
    else {
      bar.timestamp = '2026-05-18T07:01:00.123456Z';
      bar.availableAt = '2026-05-18T07:01:00.123455Z';
    }
    expect(bindMarketPitSourceTimesV3(content)).toEqual({ status: 'unavailable', reason });
  });

  it('同毫秒不同瞬时独立索引，等价偏移引用并保留原始时钟', async () => {
    const { content } = await fixture();
    const archive = content.archives[0]!;
    const bar = archive.response.bars[0]!;
    bar.timestamp = '2026-05-18T07:00:00.123455Z';
    bar.availableAt = '2026-05-18T07:01:00.123456Z';
    archive.response.sourcePriceBasis.observedAt = '2026-05-18T15:01:00.1234560+08:00';
    archive.evidence.fetchedAt = '2026-05-18T15:01:00.123457+08:00';
    archive.response.bars.push({ ...bar, timestamp: '2026-05-18T07:00:00.123456Z' });
    content.proof.barArchives[0]!.timestamp = '2026-05-18T15:00:00.1234550+08:00';
    content.proof.barArchives.push({
      ...content.proof.barArchives[0]!,
      timestamp: '2026-05-18T07:00:00.123456Z',
    });
    const original = structuredClone(content);
    const result = bindMarketPitSourceTimesV3(content);
    expect(result.status).toBe('source-times-bound');
    if (result.status !== 'source-times-bound') throw new Error('缺时钟');
    expect(result.bindings[0]).toMatchObject({
      timestamp: content.proof.barArchives[0]!.timestamp,
      availableAt: bar.availableAt,
      sourceObservedAt: archive.response.sourcePriceBasis.observedAt,
      fetchedAt: archive.evidence.fetchedAt,
    });
    expect(result.bindings).toHaveLength(4);
    expect(content).toEqual(original);
  });

  it('不同偏移与小数尾零表示同一瞬时仍拒绝重复 Bar', async () => {
    const { content } = await fixture();
    const archive = content.archives[0]!;
    const bar = archive.response.bars[0]!;
    bar.timestamp = '2026-05-18T07:00:00.123456Z';
    archive.response.bars.push({ ...bar, timestamp: '2026-05-18T15:00:00.1234560+08:00' });
    expect(bindMarketPitSourceTimesV3(content)).toEqual({
      status: 'unavailable',
      reason: 'archive-clock-invalid',
    });
  });

  it.each(['observedAt', 'fetchedAt', 'timestamp', 'availableAt'] as const)(
    '非法或未知偏移在 %s 失败关闭',
    async (field) => {
      for (const value of [
        '2026-02-30T07:00:00Z',
        '2026-05-18T07:00:00-00:00',
        '2026-05-18T07:00:00+24:00',
        `2026-05-18T07:00:00.${'1'.repeat(1025)}Z`,
      ]) {
        const { content } = await fixture();
        const archive = content.archives[0]!;
        if (field === 'observedAt') archive.response.sourcePriceBasis.observedAt = value;
        else if (field === 'fetchedAt') archive.evidence.fetchedAt = value;
        else archive.response.bars[0]![field] = value;
        expect(bindMarketPitSourceTimesV3(content)).toEqual({
          status: 'unavailable',
          reason: 'archive-clock-invalid',
        });
      }
    },
  );

  it('逐日归档保留真实观察、可见和晚 10 毫秒的抓取，不授予历史资格', async () => {
    const f = await fixture();
    const original = structuredClone(f.content);
    const result = bindMarketPitSourceTimesV3(f.content);
    expect(result.status).toBe('source-times-bound');
    if (result.status !== 'source-times-bound') throw new Error('缺时钟');
    expect(result.bindings).toHaveLength(3);
    for (const binding of result.bindings) {
      expect(binding.sourceObservedAt).toBe(binding.availableAt);
      expect(Date.parse(binding.fetchedAt) - Date.parse(binding.sourceObservedAt)).toBe(10);
    }
    expect(result).not.toHaveProperty('verified');
    expect(result).not.toHaveProperty('eligible');
    expect(f.content).toEqual(original);
  });

  it('研究时抓取的整窗不能假定修订在首 Bar 关闭时已知', async () => {
    const f = await pitReconstructionFixture();
    const content = await bindMarketPitArchiveContentV3({ ...f.input, proof: f.proof }, f.windows);
    if (content.status !== 'archives-bound') throw new Error('归档不可用');
    expect(bindMarketPitSourceTimesV3(content)).toEqual({
      status: 'unavailable',
      reason: 'bar-observation-late',
    });
  });

  it.each([
    'invalid-observation',
    'invalid-fetch',
    'fetch-before-observation',
    'visibility-before-price',
    'price-after-observation',
    'visibility-after-observation',
    'missing-bar',
    'missing-archive',
    'duplicate-archive',
  ] as const)('拒绝 %s', async (kind) => {
    const { content } = await fixture();
    const archive = content.archives[0]!;
    const bar = archive.response.bars[0]!;
    if (kind === 'invalid-observation') archive.response.sourcePriceBasis.observedAt = 'invalid';
    else if (kind === 'invalid-fetch') archive.evidence.fetchedAt = 'invalid';
    else if (kind === 'fetch-before-observation') archive.evidence.fetchedAt = bar.timestamp;
    else if (kind === 'visibility-before-price') bar.availableAt = '2026-05-18T06:59:59.000Z';
    else if (kind === 'price-after-observation') bar.timestamp = '2026-05-18T07:01:00.001Z';
    else if (kind === 'visibility-after-observation') bar.availableAt = '2026-05-18T07:01:00.001Z';
    else if (kind === 'missing-bar') archive.response.bars = [];
    else if (kind === 'missing-archive') content.archives.shift();
    else content.archives.push(structuredClone(archive));
    expect(bindMarketPitSourceTimesV3(content).status).toBe('unavailable');
  });

  it('当前晚可见的整窗即使通过来源时钟必要条件，仍无独立历史窗口资格', async () => {
    const { content } = await fixture();
    for (const archive of content.archives) {
      archive.response.sourcePriceBasis.observedAt = '2026-05-20T08:00:00.000Z';
      archive.evidence.fetchedAt = '2026-05-20T08:00:00.010Z';
      for (const bar of archive.response.bars)
        bar.availableAt = archive.response.sourcePriceBasis.observedAt;
    }
    const result = bindMarketPitSourceTimesV3(content);
    expect(result.status).toBe('source-times-bound');
    expect(result).not.toHaveProperty('eligible');
    expect(result).not.toHaveProperty('verified');
  });
});
