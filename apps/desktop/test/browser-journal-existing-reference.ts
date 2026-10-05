import { getDesktopApiClient } from '../src/shared/api/client.js';
import {
  journalAiReferenceKey,
  rememberJournalAiTask,
  writeJournalAiReference,
} from '../src/features/journal/review/journal-ai-reference.js';

export const journalExistingScope = {
  accountId: '95bd7e1a-72df-4cd7-aae8-121d8545e5ea',
  mode: 'actual' as const,
};
export const journalExistingRuns = {
  object: 'e2c829d1-6ad6-4325-81bb-26e931047669',
  period: '67e14795-2113-4174-b366-9c95db6ddb14',
  failed: '34abe590-02d6-4bb9-8018-17ec2909bd5a',
};

// 只导入既有运行的 ID；事实、输出及冻结窗口不写入生产任务引用。
export async function importExistingJournalReferences() {
  const api = getDesktopApiClient().journalReviews;
  const [object, period, failed] = await Promise.all([
    api.explanation(journalExistingRuns.object, journalExistingScope),
    api.periodExplanation(journalExistingRuns.period, journalExistingScope),
    api.explanation(journalExistingRuns.failed, journalExistingScope),
  ]);
  if (
    object.status !== 'succeeded' ||
    period.status !== 'succeeded' ||
    object.promptVersion !== 'journal-review-v2' ||
    period.promptVersion !== 'journal-period-review-v2' ||
    failed.status !== 'failed'
  ) {
    throw new Error('既有验收运行状态或提示版本变化，请保留目标数据并核对');
  }
  const [candidate, candidates] = await Promise.all([
    api.object({ ...journalExistingScope, reviewObjectId: object.reviewObjectId }),
    api.candidates({
      ...journalExistingScope,
      start: period.start,
      end: period.end,
      ...(period.symbol ? { symbol: period.symbol } : {}),
    }),
  ]);
  if (
    candidate.input.projection.evidenceFingerprint !== object.evidenceFingerprint ||
    candidates.nextCursor !== null ||
    candidates.ledgerRevision !== period.ledgerRevision ||
    candidates.projectionGeneration !== period.projectionGeneration ||
    candidates.items.length !== Object.keys(period.objectFingerprints).length ||
    candidates.items.some(
      (row) =>
        period.objectFingerprints[row.input.reference.reviewObjectId] !==
        row.input.projection.evidenceFingerprint,
    )
  ) {
    throw new Error('目标事实已变化，不能将历史任务作为当前输入的引用');
  }
  const objectRequest = {
    ...journalExistingScope,
    reference: candidate.input.reference,
    evidenceFingerprint: object.evidenceFingerprint,
    analysisDraft: object.analysisDraft ?? {},
    expectedAlgorithmVersion: object.algorithmVersion,
  };
  const periodRequest = {
    ...journalExistingScope,
    ...(period.symbol ? { symbol: period.symbol } : {}),
    start: period.start,
    end: period.end,
    expectedLedgerRevision: period.ledgerRevision,
    expectedProjectionGeneration: period.projectionGeneration,
    expectedAlgorithmVersion: period.algorithmVersion,
    objectFingerprints: period.objectFingerprints,
  };
  const objectKey = await journalAiReferenceKey(
    JSON.stringify(['object', object.accountId, object.mode, objectRequest]),
  );
  const periodKey = await journalAiReferenceKey(
    JSON.stringify(['period', period.accountId, period.mode, periodRequest]),
  );
  const indexKey = await journalAiReferenceKey(
    JSON.stringify(['tasks', object.accountId, object.mode]),
  );
  writeJournalAiReference(objectKey, object.id);
  writeJournalAiReference(periodKey, period.id);
  for (const task of [
    { id: failed.id, kind: 'object' as const },
    { id: period.id, kind: 'period' as const },
    { id: object.id, kind: 'object' as const },
  ]) {
    rememberJournalAiTask(indexKey, task);
  }
  return `已导入 3 个既有任务 ID；单笔 ${object.id}；周期 ${period.id}；窗口 [${period.start}, ${period.end})。请刷新验收页。`;
}
