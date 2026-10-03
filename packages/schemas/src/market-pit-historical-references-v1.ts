import type { z } from 'zod';
import { compareMarketPitEvidenceInstantStringsV1 as compareInstant } from './market-pit-evidence-instant-v1.js';
import type { HistoricalDecisionWindowV3 } from './market-pit-historical-evidence-v1.js';

type Evidence = HistoricalDecisionWindowV3;
type Calendar = Evidence['calendars'][number];
export type HistoricalEvidenceReferences = ReturnType<typeof indexHistoricalEvidence>;

export const indexHistoricalEvidence = (value: Evidence, context: z.RefinementCtx) => {
  const fail = (message: string) => context.addIssue({ code: 'custom', message });
  const allIds = [
    ...value.calendars,
    ...value.originalEvidence,
    ...value.calendarArtifacts,
    ...value.sourceWitnesses,
  ].map((item) => item.id);
  if (new Set(allIds).size !== allIds.length) fail('历史证据身份不得重复');
  return {
    fail,
    originals: new Map(value.originalEvidence.map((item) => [item.id, item])),
    calendars: new Map(value.calendars.map((item) => [item.id, item])),
    witnesses: new Map(value.sourceWitnesses.map((item) => [item.id, item])),
    artifacts: new Map(value.calendarArtifacts.map((item) => [item.id, item])),
  };
};

export const validatePublicationReferences = (
  ids: string[],
  { originals, fail }: HistoricalEvidenceReferences,
) => {
  if (
    new Set(ids).size !== ids.length ||
    ids.some((id) => !originals.has(id) || originals.get(id)!.kind === 'server-archive-capture')
  ) {
    fail('发布引用须唯一且指向发布原文');
  }
};

export const validateOriginalEvidence = (
  value: Evidence,
  { fail }: HistoricalEvidenceReferences,
  base64: z.ZodString,
  maxRawBytes: number,
) => {
  for (const original of value.originalEvidence) {
    if ((compareInstant(original.knownAvailableAt, original.acquiredAt) ?? 1) > 0)
      fail('原文获取不得早于其声明可见时刻');
    if (original.raw.encoding === 'base64' && !base64.safeParse(original.raw.bytes).success)
      fail('原文 base64 编码无效');
    if (new TextEncoder().encode(original.raw.bytes).byteLength > maxRawBytes)
      fail('原文超过字节上限');
  }
};

export const validateCalendarArtifacts = (
  value: Evidence,
  { originals, fail }: HistoricalEvidenceReferences,
) => {
  for (const item of value.calendarArtifacts) {
    if (originals.get(item.publicationId)?.kind !== 'calendar-package-release')
      fail('日历制品须引用发布原文');
    const paths = item.files.map((file) => file.relativePath);
    if (new Set(paths).size !== paths.length) fail('日历制品路径不得重复');
  }
};

export const validateCalendarReferences = (
  item: Calendar,
  references: HistoricalEvidenceReferences,
) => {
  const { artifacts, fail } = references;
  validatePublicationReferences(item.publicationIds, references);
  validatePublicationReferences(item.venueBindingEvidenceIds, references);
  if (new Set(item.symbolScope).size !== item.symbolScope.length) fail('日历标的范围不得重复');
  if (
    item.dateStates.some((state) =>
      state.sessions.some(
        (session) => compareInstant(session.openedAt, session.closedAt) === undefined,
      ),
    )
  )
    fail('日历时段须为有效且已知偏移的证据瞬时');
  if (item.calendarArtifactId) {
    const referenced = artifacts.get(item.calendarArtifactId);
    if (!referenced || !item.publicationIds.includes(referenced.publicationId)) {
      fail('日历制品引用或其发布集合不匹配');
    }
  }
  if ((compareInstant(item.knownAvailableAt, item.acquiredAt) ?? 1) > 0)
    fail('日历获取不得早于其声明可见时刻');
};

export const validateSourceWitnesses = (
  value: Evidence,
  references: HistoricalEvidenceReferences,
) => {
  const { originals, fail } = references;
  const windowHashes = new Map<string, string>();
  for (const item of value.sourceWitnesses) {
    if (compareInstant(item.revisionKnownAvailableAt, item.revisionKnownAvailableAt) !== 0)
      fail('来源修订声明时刻须为有效且已知偏移的证据瞬时');
    validatePublicationReferences(item.revisionPublicationIds, references);
    if (originals.get(item.captureEvidenceId)?.kind !== 'server-archive-capture')
      fail('来源见证须引用实际归档捕获原文');
    const previous = windowHashes.get(item.windowIdentityFingerprint);
    if (previous && previous !== item.completeResponseHash) fail('同一窗口来源见证摘要冲突');
    windowHashes.set(item.windowIdentityFingerprint, item.completeResponseHash);
  }
};
