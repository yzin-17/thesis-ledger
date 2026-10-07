import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  MARKET_PIT_SOURCE_CAPTURE_REGISTRATION_V1 as registration,
  parseMarketPitSourceCaptureV1,
  type MarketPitSourceCaptureInputV1,
} from '../../src/market/market-pit-source-capture-v1.js';
import { bindMarketPitArchiveContentV3 } from '../../src/market/market-pit-reconstruction-content-v3.js';
import { parseMarketPitEvidenceInstantV1 } from '../../src/market/market-pit-evidence-instant-v1.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
function captureText(input: MarketPitSourceCaptureInputV1): string {
  return JSON.stringify({
    windowIdentityFingerprint: input.archive.evidence.identityFingerprint,
    completeResponseHash: input.archive.completeResponseHash,
    fetchedAt: input.archive.evidence.fetchedAt,
  });
}
function replaceRaw(input: MarketPitSourceCaptureInputV1, text: string): void {
  input.publication.raw.bytes = text;
  input.publication.raw.sha256 = sha256(text);
}
function setFetch(input: MarketPitSourceCaptureInputV1, value: string): void {
  input.archive.evidence.fetchedAt = value;
  input.publication.knownAvailableAt = value;
  input.publication.acquiredAt = value;
  input.dataAsOf = value;
  replaceRaw(input, captureText(input));
}

// 业务单元夹具：完整内容门禁接缝通过不等于真实部署原文准入。
describe('Server 捕获原文必要绑定', () => {
  let input: MarketPitSourceCaptureInputV1;
  beforeEach(async () => {
    const fixture = await pitReconstructionFixture();
    const content = await bindMarketPitArchiveContentV3(
      { ...fixture.input, proof: fixture.proof },
      fixture.windows,
    );
    if (content.status !== 'archives-bound') throw new Error('缺少内容门禁夹具');
    const archive = content.archives[0]!;
    input = {
      archive,
      dataAsOf: fixture.input.dataAsOf,
      publication: {
        id: 'capture-unit',
        kind: 'server-archive-capture',
        publisher: registration.publisher,
        originUri: `${registration.originUriPrefix}${archive.evidence.identityFingerprint}`,
        revision: registration.revision,
        parserVersion: registration.parserVersion,
        publicationLocator: registration.publicationLocator,
        raw: { encoding: 'utf8', bytes: '', sha256: '' },
        knownAvailableAt: archive.evidence.fetchedAt,
        acquiredAt: archive.evidence.fetchedAt,
      },
    };
    replaceRaw(input, captureText(input));
  });

  it('保留真实归档 identity/hash/fetchedAt 且不改写原输入或价格事实', () => {
    const original = structuredClone(input);
    expect(parseMarketPitSourceCaptureV1(input)).toEqual({
      status: 'source-capture-bound',
      windowIdentityFingerprint: input.archive.evidence.identityFingerprint,
      completeResponseHash: input.archive.completeResponseHash,
      fetchedAt: input.archive.evidence.fetchedAt,
      knownAvailableAt: input.archive.evidence.fetchedAt,
    });
    expect(input).toEqual(original);
    expect(parseMarketPitSourceCaptureV1(input)).not.toHaveProperty('eligible');
    expect(parseMarketPitSourceCaptureV1(input)).not.toHaveProperty('verified');
  });
  it('研究时捕获只绑定原 fetchedAt，不能生成更早修订公开时间', () => {
    expect(input.archive.response.sourcePriceBasis.observedAt).not.toBe(
      input.archive.evidence.fetchedAt,
    );
    input.publication.knownAvailableAt = input.archive.response.sourcePriceBasis.observedAt;
    expect(parseMarketPitSourceCaptureV1(input)).toEqual({
      status: 'unavailable',
      reason: 'capture-time',
    });
  });
  it.each([
    'kind',
    'parserVersion',
    'publisher',
    'revision',
    'originUri',
    'publicationLocator',
  ] as const)('登记 %s 不一致拒绝', (field) => {
    const changed = { ...input.publication, [field]: 'unknown' };
    expect(
      parseMarketPitSourceCaptureV1({
        ...input,
        publication: changed,
      } as MarketPitSourceCaptureInputV1),
    ).toEqual({ status: 'unavailable', reason: 'capture-registration' });
  });
  it('错误归档 URI 不能通过相同发布者授权', () => {
    input.publication.originUri = `${registration.originUriPrefix}${'f'.repeat(64)}`;
    expect(parseMarketPitSourceCaptureV1(input).status).toBe('unavailable');
  });
  it.each(['windowIdentityFingerprint', 'completeResponseHash', 'fetchedAt'] as const)(
    '原文 %s 与实际归档不同拒绝',
    (field) => {
      const raw = JSON.parse(input.publication.raw.bytes) as Record<string, string>;
      raw[field] = field === 'fetchedAt' ? '2026-05-20T07:02:00.000001Z' : 'f'.repeat(64);
      replaceRaw(input, JSON.stringify(raw));
      expect(parseMarketPitSourceCaptureV1(input)).toEqual({
        status: 'unavailable',
        reason: 'capture-archive-mismatch',
      });
    },
  );
  it('完整响应摘要的 evidence 副本不一致拒绝', () => {
    input.archive.evidence.completeResponseHash = 'f'.repeat(64);
    expect(parseMarketPitSourceCaptureV1(input)).toEqual({
      status: 'unavailable',
      reason: 'capture-archive-mismatch',
    });
  });
  it('核对包含空白的完整原 UTF-8 字节摘要', () => {
    input.publication.raw.bytes += '\n';
    expect(parseMarketPitSourceCaptureV1(input)).toEqual({
      status: 'unavailable',
      reason: 'capture-raw-hash',
    });
    replaceRaw(input, input.publication.raw.bytes);
    expect(parseMarketPitSourceCaptureV1(input).status).toBe('source-capture-bound');
  });
  it('损坏 JSON 返回稳定错误码，不返回原文片段', () => {
    replaceRaw(input, '{"private-text":');
    expect(parseMarketPitSourceCaptureV1(input)).toEqual({
      status: 'unavailable',
      reason: 'capture-json',
    });
  });
  it.each([
    'extra',
    'missing',
    'non-string',
    'array',
    'null',
    'nested',
    'bad-digest',
    'duplicate',
    'escaped-duplicate',
  ])('拒绝 %s 原文，即使攻击者同步重算摘要', (kind) => {
    const raw = JSON.parse(input.publication.raw.bytes) as Record<string, unknown>;
    let text: string;
    if (kind === 'extra') text = JSON.stringify({ ...raw, price: 1 });
    else if (kind === 'missing') {
      delete raw.fetchedAt;
      text = JSON.stringify(raw);
    } else if (kind === 'non-string') text = JSON.stringify({ ...raw, fetchedAt: 1 });
    else if (kind === 'array') text = JSON.stringify([raw]);
    else if (kind === 'null') text = 'null';
    else if (kind === 'nested')
      text = JSON.stringify({ ...raw, fetchedAt: { time: raw.fetchedAt } });
    else if (kind === 'bad-digest') text = JSON.stringify({ ...raw, completeResponseHash: 'ABC' });
    else {
      const key = kind === 'escaped-duplicate' ? 'fetched\\u0041t' : 'fetchedAt';
      text = `${input.publication.raw.bytes.slice(0, -1)},"${key}":${JSON.stringify(raw.fetchedAt)}}`;
    }
    replaceRaw(input, text);
    expect(parseMarketPitSourceCaptureV1(input).status).toBe('unavailable');
  });
  it.each(['base64', 'bom', 'surrogate', 'byte-array', 'oversize', 'utf8-byte-budget'])(
    '拒绝 %s 字节边界',
    (kind) => {
      if (kind === 'base64') input.publication.raw.encoding = 'base64';
      else if (kind === 'bom') replaceRaw(input, `\uFEFF${input.publication.raw.bytes}`);
      else if (kind === 'surrogate') replaceRaw(input, `${input.publication.raw.bytes}\uD800`);
      else if (kind === 'byte-array')
        Object.assign(input.publication.raw, { bytes: Uint8Array.from([0xff]) });
      else if (kind === 'oversize') replaceRaw(input, ' '.repeat(registration.maxRawBytes + 1));
      else replaceRaw(input, '中'.repeat(Math.floor(registration.maxRawBytes / 3) + 1));
      expect(parseMarketPitSourceCaptureV1(input).status).toBe('unavailable');
    },
  );
  it('同一瞬时的不同 offset 和尾零等价，输出仍保留原归档文本', () => {
    setFetch(input, '2026-05-20T07:02:00.123456789012Z');
    replaceRaw(
      input,
      captureText(input).replace('07:02:00.123456789012Z', '15:02:00.12345678901200+08:00'),
    );
    input.publication.knownAvailableAt = '2026-05-20T15:02:00.1234567890120+08:00';
    const result = parseMarketPitSourceCaptureV1(input);
    expect(result.status).toBe('source-capture-bound');
    if (result.status === 'source-capture-bound')
      expect(result.fetchedAt).toBe(input.archive.evidence.fetchedAt);
  });
  it.each(['known-before', 'known-after', 'acquired-before', 'cutoff-before', 'acquired-after'])(
    '亚毫秒边界 %s 必须拒绝',
    (kind) => {
      setFetch(input, '2026-05-20T07:02:00.123456789012Z');
      const before = '2026-05-20T07:02:00.123456789011Z';
      const after = '2026-05-20T07:02:00.123456789013Z';
      if (kind === 'known-before') input.publication.knownAvailableAt = before;
      else if (kind === 'known-after') input.publication.knownAvailableAt = after;
      else if (kind === 'acquired-before') input.publication.acquiredAt = before;
      else if (kind === 'cutoff-before') input.dataAsOf = before;
      else input.publication.acquiredAt = after;
      expect(parseMarketPitSourceCaptureV1(input)).toEqual({
        status: 'unavailable',
        reason: 'capture-time',
      });
    },
  );
  it('fetched/known/acquired/cutoff 精确相等允许', () => {
    setFetch(input, '2026-05-20T07:02:00.123456789012Z');
    expect(parseMarketPitSourceCaptureV1(input).status).toBe('source-capture-bound');
  });
  it.each(['knownAvailableAt', 'acquiredAt', 'dataAsOf', 'archive-fetch'])(
    '未知 %s 拒绝且不从 sourceObservedAt 补齐',
    (field) => {
      if (field === 'dataAsOf') input.dataAsOf = 'unknown';
      else if (field === 'archive-fetch') input.archive.evidence.fetchedAt = 'unknown';
      else Object.assign(input.publication, { [field]: 'unknown' });
      expect(parseMarketPitSourceCaptureV1(input)).toEqual({
        status: 'unavailable',
        reason: 'capture-clock-invalid',
      });
    },
  );
});

describe('证据精确瞬时输入范围', () => {
  it.each([
    '2026-02-29T00:00:00Z',
    '1900-02-29T00:00:00Z',
    '0000-01-01T00:00:00Z',
    '2026-04-31T00:00:00Z',
    '2026-01-01T24:00:00Z',
    '2026-01-01T00:60:00Z',
    '2026-01-01T00:00:60Z',
    '2026-01-01T00:00:00+24:00',
    '2026-01-01T00:00:00+08:60',
    '2026-01-01T00:00:00-00:00',
    '2026-01-01T00:00:00',
    '2026-01-01T00:00:00+0800',
    `2026-01-01T00:00:00.${'1'.repeat(1025)}Z`,
  ])('拒绝非法时间 %s', (value) => {
    expect(() => parseMarketPitEvidenceInstantV1(value)).toThrow('capture-clock-invalid');
  });
  it.each(['2000-02-29T00:00:00Z', '0001-01-01T00:00:00Z', '9999-12-31T23:59:59.9Z'])(
    '允许有效日期 %s',
    (value) => {
      expect(() => parseMarketPitEvidenceInstantV1(value)).not.toThrow();
    },
  );
});
