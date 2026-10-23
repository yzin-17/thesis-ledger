import { performanceTargetsInputSchema } from '@thesis-ledger/schemas';
import type { allocationLabels } from '../performance-read/performance-projection';
export type TargetDraft = Record<keyof typeof allocationLabels, string>;
export function targetDraft(targets: Record<string, number>): TargetDraft {
  return {
    stock: String((targets.stock ?? 0) * 100),
    etf: String((targets.etf ?? 0) * 100),
    fund: String((targets.fund ?? 0) * 100),
    index: String((targets.index ?? 0) * 100),
    cash: String((targets.cash ?? 0) * 100),
  };
}
export function buildTargetsInput(draft: TargetDraft, accountId: string | null) {
  const targets: Record<string, number> = {};
  for (const [key, value] of Object.entries(draft)) {
    if (!/^\d+(?:\.\d+)?$/.test(value.trim())) throw new Error('目标权重必须为非负数字。');
    const weight = Number(value) / 100;
    if (!Number.isFinite(weight) || weight < 0 || weight > 1)
      throw new Error('各类权重必须在 0～100% 内。');
    targets[key] = weight;
  }
  const total = Object.values(targets).reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-8) throw new Error('目标权重之和必须为 100%。');
  return performanceTargetsInputSchema.parse({
    scope: accountId ? 'account' : 'portfolio',
    ...(accountId ? { accountId } : {}),
    targets,
  });
}
