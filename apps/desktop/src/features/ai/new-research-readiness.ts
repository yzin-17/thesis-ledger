import type { useCreateAiRunMutation } from './ai.mutations.js';
import type { useAiCapabilitiesQuery, useAiResearchRetryPrefillQuery } from './ai.queries.js';
import type { AiResearchScope } from './ai.types.js';
import type { useResearchAccountScope } from './research-account-scope.js';

type NewResearchReadiness = {
  scope: AiResearchScope;
  accountId: string | null;
  symbol: string | null;
  strategyVersionId: string | null;
  retryPrefillQuery: ReturnType<typeof useAiResearchRetryPrefillQuery>;
  retryContextReselected: boolean;
  retryModeMismatch: boolean;
  effectiveAccountId: string | null;
  accountsQuery: ReturnType<typeof useResearchAccountScope>['accountsQuery'];
  questionError: string | null;
  entityError: string | null;
  mutation: ReturnType<typeof useCreateAiRunMutation>;
  retryOfRunId: string | undefined;
  retryConfirmed: boolean;
  unknownRiskConfirmed: boolean;
  capabilitiesQuery: ReturnType<typeof useAiCapabilitiesQuery>;
};

export function newResearchEntityError({
  scope,
  accountId,
  symbol,
  strategyVersionId,
  retryPrefillQuery,
  retryContextReselected,
}: Pick<
  NewResearchReadiness,
  | 'scope'
  | 'accountId'
  | 'symbol'
  | 'strategyVersionId'
  | 'retryPrefillQuery'
  | 'retryContextReselected'
>) {
  let entityError: string | null = null;
  if (scope === 'account' && !accountId) entityError = '请选择一个账户。';
  if (scope === 'position' && !accountId) entityError = '请先选择账户。';
  if (scope === 'position' && accountId && !symbol) entityError = '请选择账户中的实际持仓。';
  if (scope === 'strategy' && !strategyVersionId) entityError = '请选择一个具体策略版本。';
  if (retryPrefillQuery.data?.contextState === 'missing' && !retryContextReselected && !entityError)
    entityError = '原研究对象已失效，请显式重新选择研究范围或对象。';
  if (retryPrefillQuery.data?.contextState === 'forbidden' && !entityError)
    entityError = '原研究对象已不可访问，不能再次生成。';

  return entityError;
}
export function newResearchCanSubmit({
  retryModeMismatch,
  scope,
  effectiveAccountId,
  accountsQuery,
  questionError,
  entityError,
  mutation,
  retryOfRunId,
  retryPrefillQuery,
  retryConfirmed,
  unknownRiskConfirmed,
  capabilitiesQuery,
}: Omit<
  NewResearchReadiness,
  'accountId' | 'symbol' | 'strategyVersionId' | 'retryContextReselected'
>) {
  return (
    !retryModeMismatch &&
    ((scope !== 'account' && scope !== 'position') ||
      (Boolean(effectiveAccountId) && !accountsQuery.isError && !accountsQuery.isPending)) &&
    !questionError &&
    !entityError &&
    !mutation.isPending &&
    (!retryOfRunId || !retryPrefillQuery.isPending) &&
    (!retryOfRunId || !retryPrefillQuery.isError) &&
    (!retryOfRunId || retryConfirmed) &&
    (!retryPrefillQuery.data?.requiresUnknownOutcomeAcknowledgement || unknownRiskConfirmed) &&
    capabilitiesQuery.data?.canStart === true
  );
}
export function newResearchCapabilitySummary(
  scope: AiResearchScope,
  capabilitiesQuery: ReturnType<typeof useAiCapabilitiesQuery>,
) {
  const expectedTools = {
    portfolio: ['getPortfolio', 'getPositions', 'getRisk'],
    account: ['getPortfolio', 'getPositions', 'getRisk', 'getJournal'],
    position: ['getPositions', 'getRisk', 'getJournal'],
    strategy: ['getRisk', 'getJournal'],
  }[scope];
  const toolLabels: Record<string, string> = {
    getPortfolio: '组合摘要',
    getPositions: '持仓',
    getRisk: '风险历史',
    getJournal: '研究日志',
  };
  const availableTools = new Set(
    capabilitiesQuery.data?.providers.flatMap((provider) => provider.tools) ?? [],
  );
  let boundary = '正在检查可用读取范围';
  if (capabilitiesQuery.data) {
    const labels = expectedTools
      .filter((tool) => availableTools.has(tool))
      .map((tool) => toolLabels[tool] ?? tool);
    boundary = labels.length > 0 ? labels.join('、') : '当前没有可用的只读 Tool';
  }

  let capabilityMessage = '正在检查模型提供方、工具和执行服务…';
  if (capabilitiesQuery.isError) capabilityMessage = '能力预检失败，请先刷新后再提交研究。';
  else if (capabilitiesQuery.data && !capabilitiesQuery.data.canStart) {
    const unavailable = capabilitiesQuery.data.providers[0];
    const missing = unavailable?.missing.length ? `缺少：${unavailable.missing.join('、')}。` : '';
    const impact = unavailable?.impact[0] ?? '研究任务不会进入可执行队列。';
    capabilityMessage = `${missing}${impact}`;
  } else if (capabilitiesQuery.data?.providers.some((provider) => provider.state === 'demo'))
    capabilityMessage = '当前使用演示服务，结果会标记为演示数据。';
  else if (capabilitiesQuery.data?.canStart)
    capabilityMessage = '模型提供方、工具和执行服务已就绪。';

  return { boundary, capabilityMessage };
}
