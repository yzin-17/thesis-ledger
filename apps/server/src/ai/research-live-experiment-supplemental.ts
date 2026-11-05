import { z } from 'zod';

const freeProbeBudgetSchema = z.strictObject({
  version: z.literal('research-free-probe-budget-v1'),
  entries: z
    .array(
      z.strictObject({
        requestId: z.uuid(),
        resultSHA256: z.string().regex(/^[a-f0-9]{64}$/),
        providerReportedCostUSD: z.literal('0'),
      }),
    )
    .max(20),
});

export type LiveSupplementalBudget = z.infer<typeof freeProbeBudgetSchema>;

export function verifyFreeProbeBudget(raw?: LiveSupplementalBudget) {
  const budget = freeProbeBudgetSchema.parse(
    raw ?? {
      version: 'research-free-probe-budget-v1',
      entries: [],
    },
  );
  if (
    new Set(budget.entries.map((entry) => entry.requestId)).size !== budget.entries.length ||
    new Set(budget.entries.map((entry) => entry.resultSHA256)).size !== budget.entries.length
  )
    throw new Error('补充路由测试重复');
  return { budget, requests: budget.entries.length, amount: '0', reservedUnknown: '0' };
}
