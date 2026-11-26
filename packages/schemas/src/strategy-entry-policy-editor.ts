import { materializeEntryPolicy } from '@thesis-ledger/domain';
import { strategySchema } from './backtest-strategy.js';

/** 进入编辑时投影原版本政策；之后修改保护不再推断，非法输入留给表单校验。 */
export function projectStrategyEntryPolicyForEditing<T extends Record<string, unknown>>(draft: T, baseline: unknown = draft): T {
  const copy = structuredClone(draft);
  if (copy.entryTrigger !== undefined) return copy;
  const parsed = strategySchema.safeParse(baseline);
  if (!parsed.success) return copy;
  return { ...copy, entryTrigger: materializeEntryPolicy(parsed.data).entryTrigger };
}
