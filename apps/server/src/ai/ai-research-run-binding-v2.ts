import type { AiRun } from '@prisma/client';
import { researchScopeSnapshotV2Schema, type AiFrozenResearchV2 } from '@thesis-ledger/schemas';
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
