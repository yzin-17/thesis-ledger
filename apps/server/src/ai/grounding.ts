import { aiAnalysisSchema } from '@thesis-ledger/schemas';

export const evidenceCitation = (tool: string, data: unknown, toolCallId?: string) => {
  const value = data as {
    sourceId?: string;
    provider?: string;
    marketTime?: string;
    availableAt?: string;
    fetchedAt?: string;
  };
  const observedAt = value.marketTime ?? value.availableAt ?? new Date().toISOString();
  return {
    ...(toolCallId ? { toolCallId } : {}),
    tool,
    sourceId: value.sourceId ?? `${tool}:result`,
    provider: value.provider ?? 'thesis-ledger-tool',
    observedAt,
    ...(value.marketTime ? { marketTime: value.marketTime } : {}),
    ...(value.availableAt ? { availableAt: value.availableAt } : {}),
    ...(value.fetchedAt ? { fetchedAt: value.fetchedAt } : {}),
  };
};

export const validateGroundedAnalysis = (value: unknown) => {
  const parsed = aiAnalysisSchema.parse(value);
  if (parsed.evidence.some((item) => item.citations.length === 0))
    throw new Error('AI 结论缺少来源');
  if (/(自动交易|立即下单|买入\s*\d+|卖出\s*\d+)/u.test(parsed.conclusion))
    throw new Error('AI 输出不得生成执行订单');
  const numbers = parsed.conclusion.match(/\d+(?:\.\d+)?/g) ?? [];
  const evidenceText = parsed.evidence.map((item) => item.claim).join(' ');
  if (numbers.some((number) => !evidenceText.includes(number)))
    throw new Error('AI 结论中的关键数字缺少可追溯证据');
  return parsed;
};
