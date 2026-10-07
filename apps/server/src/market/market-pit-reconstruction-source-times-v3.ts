import type { MarketPitArchiveContentResultV3 } from './market-pit-reconstruction-content-v3.js';
import {
  compareMarketPitEvidenceInstantStringsV1 as compare,
  parseMarketPitEvidenceInstantV1,
} from './market-pit-evidence-instant-v1.js';

type BoundContent = Extract<MarketPitArchiveContentResultV3, { status: 'archives-bound' }>;
export type MarketPitSourceTimeBindingV3 = {
  timestamp: string;
  availableAt: string;
  sourceObservedAt: string;
  fetchedAt: string;
  windowIdentityFingerprint: string;
};
export type MarketPitSourceTimesResultV3 =
  | { status: 'source-times-bound'; bindings: MarketPitSourceTimeBindingV3[] }
  | {
      status: 'unavailable';
      reason:
        | 'archive-clock-invalid'
        | 'archive-observation-order'
        | 'archive-future-at-observation'
        | 'bar-observation-late'
        | 'bar-archive-missing';
    };

function instantKey(value: string): string | undefined {
  try {
    const instant = parseMarketPitEvidenceInstantV1(value);
    return `${instant.seconds}:${instant.fraction}`;
  } catch {
    return undefined;
  }
}

function archiveBars(
  archive: BoundContent['archives'][number],
): Map<string, string> | MarketPitSourceTimesResultV3 {
  const observation = archive.response.sourcePriceBasis.observedAt;
  const order = compare(archive.evidence.fetchedAt, observation);
  if (order === undefined) return { status: 'unavailable', reason: 'archive-clock-invalid' };
  if (order < 0) return { status: 'unavailable', reason: 'archive-observation-order' };
  const bars = new Map<string, string>();
  for (const bar of archive.response.bars) {
    const key = instantKey(bar.timestamp);
    const availability = compare(bar.availableAt, bar.timestamp);
    if (key === undefined || availability === undefined || availability < 0 || bars.has(key))
      return { status: 'unavailable', reason: 'archive-clock-invalid' };
    const priceOrder = compare(bar.timestamp, observation);
    const visibleOrder = compare(bar.availableAt, observation);
    if (priceOrder === undefined || visibleOrder === undefined)
      return { status: 'unavailable', reason: 'archive-clock-invalid' };
    if (priceOrder > 0 || visibleOrder > 0)
      return { status: 'unavailable', reason: 'archive-future-at-observation' };
    bars.set(key, bar.availableAt);
  }
  return bars;
}

/** 来源观察与传输抓取分别核对；仍未证明原始历史决策窗口。 */
export const bindMarketPitSourceTimesV3 = (content: BoundContent): MarketPitSourceTimesResultV3 => {
  const archives = new Map<
    string,
    {
      sourceObservedAt: string;
      fetchedAt: string;
      bars: Map<string, string>;
    }
  >();
  for (const archive of content.archives) {
    const sourceObservedAt = archive.response.sourcePriceBasis.observedAt;
    const fetchedAt = archive.evidence.fetchedAt;
    const bars = archiveBars(archive);
    if (!(bars instanceof Map)) return bars;
    const id = archive.evidence.identityFingerprint;
    if (archives.has(id)) return { status: 'unavailable', reason: 'archive-clock-invalid' };
    archives.set(id, { sourceObservedAt, fetchedAt, bars });
  }
  const bindings: MarketPitSourceTimeBindingV3[] = [];
  for (const reference of content.proof.barArchives) {
    const archive = archives.get(reference.windowIdentityFingerprint);
    const key = instantKey(reference.timestamp);
    const availableAt = key === undefined ? undefined : archive?.bars.get(key);
    if (!archive || !availableAt) return { status: 'unavailable', reason: 'bar-archive-missing' };
    const order = compare(archive.sourceObservedAt, availableAt);
    if (order === undefined) return { status: 'unavailable', reason: 'archive-clock-invalid' };
    if (order > 0) return { status: 'unavailable', reason: 'bar-observation-late' };
    bindings.push({
      timestamp: reference.timestamp,
      availableAt,
      sourceObservedAt: archive.sourceObservedAt,
      fetchedAt: archive.fetchedAt,
      windowIdentityFingerprint: reference.windowIdentityFingerprint,
    });
  }
  return { status: 'source-times-bound', bindings };
};
