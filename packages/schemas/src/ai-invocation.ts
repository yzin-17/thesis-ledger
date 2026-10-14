import { z } from 'zod';
import { aiCostFactsSchema, aiUsageFactsSchema } from './ai-execution.js';

const key = z.string().trim().min(1).max(240);
const digest = z.string().regex(/^[a-f0-9]{64}$/u);
export const aiInvocationPreparationSchema = z.object({
  requestId: z.uuid(),
  consumer: z.literal('strategy_authoring'),
  referenceId: z.uuid(),
  ownerId: z.uuid(),
  executionAttempt: z.number().int().positive(),
  providerId: key,
  requestedModel: key,
  inputFingerprint: digest,
}).strict();
export type AiInvocationPreparation = z.infer<typeof aiInvocationPreparationSchema>;

export const aiInvocationFactSchema = z.object({
  eventKey: z.uuid(),
  kind: z.enum(['dispatching', 'not_sent', 'unknown', 'received']),
  actualModel: key.nullable(),
  usage: aiUsageFactsSchema.nullable(),
  cost: aiCostFactsSchema,
  errorCode: key.nullable(),
  outputFingerprint: digest.nullable(),
}).strict().superRefine((fact, ctx) => {
  if (fact.cost.status === 'unknown' && (fact.cost.currency !== null || fact.cost.source !== null || fact.cost.pricingVersion !== null))
    ctx.addIssue({ code: 'custom', message: '未知费用保留空币种及计费来源' });
  if (fact.kind === 'dispatching' && (fact.actualModel !== null || fact.usage !== null ||
    fact.cost.status !== 'unknown' || fact.errorCode !== null || fact.outputFingerprint !== null))
    ctx.addIssue({ code: 'custom', message: '派发时不能宣称响应或计量事实' });
  if (fact.kind === 'not_sent' && (fact.actualModel !== null || fact.outputFingerprint !== null || fact.usage !== null || fact.cost.status !== 'unknown'))
    ctx.addIssue({ code: 'custom', message: '未发送请求不能具有响应事实' });
  if (fact.kind === 'unknown' && fact.outputFingerprint !== null)
    ctx.addIssue({ code: 'custom', message: '未知结果不能具有完整输出摘要' });
});
export type AiInvocationFact = z.infer<typeof aiInvocationFactSchema>;
