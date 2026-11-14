import { strategySchema } from '@thesis-ledger/schemas';
import { strategyDefinitionDiff, toRecord } from './strategy-optimization-common.js';

export function projectCandidateDefinitionDiff(
  diff: unknown,
  baseline: unknown,
  candidate: unknown,
) {
  if (!Array.isArray(diff) || !diff.some((entry) => toRecord(entry).kind === 'full-strategy'))
    return diff;
  const before = strategySchema.safeParse(baseline);
  const after = strategySchema.safeParse(candidate);
  if (!before.success || !after.success) {
    return [
      {
        kind: 'full-strategy',
        status: 'unavailable',
        reason: !before.success
          ? '实验冻结的基线策略定义缺失或无效，无法比较。'
          : '冻结的候选策略定义缺失或无效，无法比较。',
      },
    ];
  }
  const keys = new Set(
    strategyDefinitionDiff(before.data, after.data).map((entry) => entry.path.split('.')[1]!),
  );
  if (keys.size === 0) return [{ kind: 'full-strategy', status: 'unchanged' }];
  const left = toRecord(before.data);
  const right = toRecord(after.data);
  return [...keys].map((key) => ({
    kind: 'full-strategy',
    path: `$.${key}`,
    before: left[key],
    after: right[key],
  }));
}
