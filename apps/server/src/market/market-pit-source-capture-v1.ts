import { createHash } from 'node:crypto';
import type { HistoricalDecisionWindowV3 } from '@thesis-ledger/schemas';
import type { MarketPitBoundArchiveV3 } from './market-pit-reconstruction-content-v3.js';
import {
  compareMarketPitEvidenceInstantsV1 as compare,
  parseMarketPitEvidenceInstantV1 as instant,
} from './market-pit-evidence-instant-v1.js';

type Publication = HistoricalDecisionWindowV3['originalEvidence'][number];
type Capture = {
  windowIdentityFingerprint: string;
  completeResponseHash: string;
  fetchedAt: string;
};

export const MARKET_PIT_SOURCE_CAPTURE_REGISTRATION_V1 = Object.freeze({
  parserVersion: 'thesis-ledger-server-archive-capture-v1',
  kind: 'server-archive-capture',
  publisher: 'ThesisLedger Server',
  revision: '1',
  originUriPrefix: 'urn:thesis-ledger:market-window-archive:',
  publicationLocator: 'json:windowIdentityFingerprint,completeResponseHash,fetchedAt',
  maxRawBytes: 8 * 1024 * 1024,
});
export type MarketPitSourceCaptureInputV1 = {
  publication: Publication;
  /** 必须来自实际完整内容门禁；此函数不重新证明价格内容。 */
  archive: MarketPitBoundArchiveV3;
  dataAsOf: string;
};
export type MarketPitSourceCaptureResultV1 =
  | ({ status: 'source-capture-bound'; knownAvailableAt: string } & Capture)
  | { status: 'unavailable'; reason: string };

function verifyRegistration(publication: Publication, archive: MarketPitBoundArchiveV3): void {
  const registration = MARKET_PIT_SOURCE_CAPTURE_REGISTRATION_V1;
  if (
    publication.kind !== registration.kind ||
    publication.parserVersion !== registration.parserVersion ||
    publication.publisher !== registration.publisher ||
    publication.revision !== registration.revision ||
    publication.publicationLocator !== registration.publicationLocator ||
    publication.originUri !==
      `${registration.originUriPrefix}${archive.evidence.identityFingerprint}`
  )
    throw new Error('capture-registration');
}

function verifyRawBytes(publication: Publication): string {
  const raw = publication.raw;
  const limit = MARKET_PIT_SOURCE_CAPTURE_REGISTRATION_V1.maxRawBytes;
  if (raw.encoding !== 'utf8') throw new Error('capture-encoding');
  if (typeof raw.bytes !== 'string' || raw.bytes.length > limit) throw new Error('capture-budget');
  const bytes = new TextEncoder().encode(raw.bytes);
  if (bytes.length > limit) throw new Error('capture-budget');
  // 孤立 UTF-16 surrogate 会被编码器替换；必须在任何摘要核对前拒绝。
  if (
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) !== raw.bytes ||
    raw.bytes.startsWith('\uFEFF')
  )
    throw new Error('capture-utf8');
  if (createHash('sha256').update(bytes).digest('hex') !== raw.sha256)
    throw new Error('capture-raw-hash');
  return raw.bytes;
}

function parseCapture(text: string): Capture {
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new Error('capture-json');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('capture-fields');
  const record = value as Record<string, unknown>;
  const keys = ['windowIdentityFingerprint', 'completeResponseHash', 'fetchedAt'];
  if (Object.keys(record).length !== 3 || keys.some((key) => typeof record[key] !== 'string'))
    throw new Error('capture-fields');
  // 三个 string 字段必须只有六个词法 string token；JSON.parse 会吞掉重复键。
  const tokens = text.match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  if (tokens.length !== 6) throw new Error('capture-duplicate-key');
  const fingerprint = record.windowIdentityFingerprint as string;
  const hash = record.completeResponseHash as string;
  if (!/^[a-f0-9]{64}$/.test(fingerprint) || !/^[a-f0-9]{64}$/.test(hash))
    throw new Error('capture-fields');
  return {
    windowIdentityFingerprint: fingerprint,
    completeResponseHash: hash,
    fetchedAt: record.fetchedAt as string,
  };
}

function verifyArchive(capture: Capture, archive: MarketPitBoundArchiveV3): void {
  if (
    capture.windowIdentityFingerprint !== archive.evidence.identityFingerprint ||
    capture.completeResponseHash !== archive.completeResponseHash ||
    capture.completeResponseHash !== archive.evidence.completeResponseHash
  )
    throw new Error('capture-archive-mismatch');
  if (compare(instant(capture.fetchedAt), instant(archive.evidence.fetchedAt)) !== 0)
    throw new Error('capture-archive-mismatch');
}

function verifyClocks(
  publication: Publication,
  archive: MarketPitBoundArchiveV3,
  dataAsOf: string,
): void {
  const fetched = instant(archive.evidence.fetchedAt);
  const known = instant(publication.knownAvailableAt);
  const acquired = instant(publication.acquiredAt);
  const cutoff = instant(dataAsOf);
  if (
    compare(known, fetched) !== 0 ||
    compare(acquired, fetched) < 0 ||
    compare(acquired, cutoff) > 0
  )
    throw new Error('capture-time');
}

/** 捕获内容必要条件：不签发修订公开时间、证券场所、日历或严格 PIT 资格。 */
export function parseMarketPitSourceCaptureV1(
  input: MarketPitSourceCaptureInputV1,
): MarketPitSourceCaptureResultV1 {
  try {
    const { publication, archive, dataAsOf } = input;
    verifyRegistration(publication, archive);
    const capture = parseCapture(verifyRawBytes(publication));
    verifyArchive(capture, archive);
    verifyClocks(publication, archive, dataAsOf);
    return {
      status: 'source-capture-bound',
      windowIdentityFingerprint: archive.evidence.identityFingerprint,
      completeResponseHash: archive.completeResponseHash,
      fetchedAt: archive.evidence.fetchedAt,
      knownAvailableAt: archive.evidence.fetchedAt,
    };
  } catch (error) {
    return {
      status: 'unavailable',
      reason: error instanceof Error ? error.message : 'capture-invalid',
    };
  }
}
