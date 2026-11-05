import type { AiRun } from '@prisma/client';
import {
  aiExecutionSummarySchema,
  researchScopeSnapshotV2Schema,
  type AiFrozenResearchV2,
  type ResearchResultV2,
} from '@thesis-ledger/schemas';
import { AiFrozenResearchError } from './ai-frozen-research.js';
import { researchSubmissionDigestV2 } from './ai-research-submission-identity-v2.js';

type Binding = Pick<
  AiRun,
  | 'researchScopeSnapshot'
  | 'researchOwnerId'
  | 'researchSubmissionId'
  | 'researchInputDigest'
  | 'promptVersion'
  | 'question'
>;
/** 执行与读取共用根任务身份校验，历史不会因查询被重新绑定。 */
export function assertResearchRunBindingV2(run: Binding, frozen: AiFrozenResearchV2) {
  const scope = researchScopeSnapshotV2Schema.safeParse(run.researchScopeSnapshot);
  if (
    !scope.success ||
    JSON.stringify(scope.data) !== JSON.stringify(frozen.scopeSnapshot) ||
    !run.researchOwnerId ||
    run.researchSubmissionId !== frozen.request.submissionId.toLowerCase() ||
    run.researchInputDigest !== researchSubmissionDigestV2(frozen.request) ||
    run.promptVersion !== frozen.prompt.version ||
    run.question !== frozen.request.question
  )
    throw new AiFrozenResearchError('V2 冻结范围、提交身份或问题与持久任务不一致');
}

/** SDK 完成事实绑定实际模型，不能以任意一次成功请求放行报告模型。 */
export function assertResearchResultModelBindingV2(
  run: Pick<AiRun, 'provider' | 'model' | 'modelMetadata' | 'executionAttempt'>,
  model: ResearchResultV2['model'],
) {
  if (model.providerId !== run.provider)
    throw new AiFrozenResearchError('V2 结果 Provider 与持久任务不一致');
  const metadata = run.modelMetadata;
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    metadata.sdkExecution === undefined
  ) {
    if (model.modelId === run.model) return;
    throw new AiFrozenResearchError('V2 实际模型缺少成功请求审计');
  }
  const parsed = aiExecutionSummarySchema.safeParse(metadata.sdkExecution);
  if (
    !parsed.success ||
    parsed.data.generationStatus !== 'complete' ||
    parsed.data.contract.id !== 'research' ||
    parsed.data.contract.version !== 'research-generation-v2'
  )
    throw new AiFrozenResearchError('V2 实际模型缺少完整研究执行审计');
  const request = parsed.data.requests.at(-1);
  if (
    !request ||
    request.state !== 'completed' ||
    request.dispatchingAt === null ||
    request.completedAt === null ||
    request.dispatchExecutionAttempt !== run.executionAttempt ||
    request.reservation.provider !== run.provider ||
    request.reservation.model !== run.model ||
    !request.reservation.configurationFingerprint ||
    request.error !== null ||
    request.outcome?.status !== 'complete' ||
    !request.outcome.schemaAccepted ||
    request.outcome.contract.id !== 'research' ||
    request.outcome.contract.version !== 'research-generation-v2'
  )
    throw new AiFrozenResearchError('V2 实际模型缺少匹配的最终成功请求审计');
  if (model.modelId !== (request.outcome.actualModel ?? run.model))
    throw new AiFrozenResearchError('V2 结果模型与最终成功请求的实际模型不一致');
}
