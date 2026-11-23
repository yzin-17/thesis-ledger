import { z } from 'zod';
import { arenaDecisionSchema } from './arena-research.js';
import { arenaLiveDecisionSchema } from './arena-live-protocol.js';
import { arenaLiveGeneratedOrderSchema } from './arena-live-generated-orders.js';

const symbol = z.string().trim().min(1).max(80);
const timeframe = z.enum(['1m', '5m', '15m', '60m', '1d']);
export const arenaResearchToolRequestSchema = z.discriminatedUnion('name', [
  z.strictObject({ name: z.literal('search_instruments'), query: z.string().trim().min(1).max(200) }),
  z.strictObject({ name: z.literal('quote'), symbol }),
  z.strictObject({ name: z.literal('bars'), symbol, timeframe, limit: z.number().int().min(1).max(100) }),
  z.strictObject({ name: z.literal('indicators'), symbol, timeframe, indicator: z.enum(['MA', 'MACD', 'RSI']),
    limit: z.number().int().min(1).max(100).default(5)
      .describe('返回最近的指标采样点数，默认 5；需要更多历史比较时按需增加，最多 100。计算所需预热数据由服务端读取。') }),
  z.strictObject({ name: z.literal('news'), symbol }),
  z.strictObject({ name: z.literal('financials'), symbol }),
  z.strictObject({ name: z.literal('web_search'), query: z.string().trim().min(1).max(500) }),
]);
// 新生成必须显式选择生命周期和退出关系；历史决策仍用原输入合同读取。
export const arenaLiveGeneratedDecisionSchema = arenaLiveDecisionSchema.safeExtend({ orders: z.array(arenaLiveGeneratedOrderSchema).max(100) });
export const arenaLiveResearchStepSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('tools'), requests: z.array(arenaResearchToolRequestSchema).min(1).max(5) }),
  z.strictObject({ action: z.literal('decision'), decision: arenaLiveGeneratedDecisionSchema }),
]);
export type ArenaResearchToolRequest = z.infer<typeof arenaResearchToolRequestSchema>;
export type ArenaLiveResearchStep = z.infer<typeof arenaLiveResearchStepSchema>;
export const arenaGenerationRefSchemas = [
  z.strictObject({ id: z.literal('arena_decision'), version: z.literal('arena-decision-v1') }),
  z.strictObject({ id: z.literal('arena_live_research'), version: z.enum(['arena-live-research-v2', 'arena-live-research-v3', 'arena-live-research-v4', 'arena-live-research-v5', 'arena-live-research-v6']) }),
] as const;
export const arenaGenerationContracts = {
  arenaDecision: { ref: { id: 'arena_decision', version: 'arena-decision-v1' } as const, schema: arenaDecisionSchema },
  arenaLiveResearch: { ref: { id: 'arena_live_research', version: 'arena-live-research-v6' } as const, schema: arenaLiveResearchStepSchema },
};
