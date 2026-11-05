import type { AiResearchRetryPrefill } from '@thesis-ledger/schemas';
export function researchRetryIssue(input: {
  source: AiResearchRetryPrefill | undefined;
  mode: 'actual' | 'shadow';
  confirmed: boolean;
  acknowledged: boolean;
  modelReady: boolean;
  capabilityReady: boolean;
}) {
  const { source } = input;
  if (!source || source.contextState !== 'valid') return '原任务范围缺失或无权读取。';
  if (source.context.mode && source.context.mode !== input.mode) return '原任务与当前模式不一致。';
  if (!input.confirmed) return '请核对原范围后确认。';
  if (source.requiresUnknownOutcomeAcknowledgement && !input.acknowledged)
    return '请确认原任务结果未知可能造成重复生成。';
  if (!input.modelReady || !input.capabilityReady) return '当前模型或研究能力未就绪。';
  return null;
}
