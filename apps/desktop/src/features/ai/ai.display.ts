import type { AiResearchContext, AiResearchScope, AiRunRecord } from './ai.types.js';

const scopeLabels: Record<AiResearchScope, string> = {
  portfolio: '全组合',
  account: '账户',
  position: '单个持仓',
  strategy: '策略版本',
};

const statusLabels: Record<string, string> = {
  queued: '排队中',
  running: '研究中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};

export const scopeLabel = (scope: string | undefined) =>
  scopeLabels[scope as AiResearchScope] ?? '未知范围';

export const statusLabel = (status: string | undefined) => statusLabels[status ?? ''] ?? '未知状态';

export const statusVariant = (
  status: string | undefined,
): 'default' | 'secondary' | 'destructive' | 'outline' => {
  if (status === 'succeeded') return 'default';
  if (status === 'failed') return 'destructive';
  if (status === 'running' || status === 'queued') return 'secondary';
  return 'outline';
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '时间未记录';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间未记录';
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  return sameDay
    ? date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};

export const formatFullDateTime = (value: string | null | undefined) => {
  if (!value) return '未记录';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '未记录' : date.toLocaleString('zh-CN', { hour12: false });
};

export const contextSummary = (context: AiResearchContext | null | undefined) => {
  if (!context) return '上下文未记录';
  if (context.scope === 'position') return context.symbol ?? '持仓未记录';
  if (context.scope === 'account') return context.accountId ? '指定账户' : '账户未记录';
  if (context.scope === 'strategy') return context.strategyVersionId ? '策略版本' : '策略未记录';
  return '当前投资组合';
};

export const questionSummary = (run: AiRunRecord) => {
  const question = run.question?.trim();
  if (question) return question;
  return `未记录研究问题 · ${run.id.slice(0, 8)}`;
};

export const checkpointLabel = (checkpoint: Record<string, unknown> | null | undefined) => {
  const step = checkpoint?.step;
  if (typeof step !== 'string') return '研究正在进行';
  const labels: Record<string, string> = {
    collect_evidence: '收集证据',
    research: '收集证据',
    assess_risk: '核对风险',
    synthesize: '生成结论',
    compose: '生成结论',
  };
  return labels[step] ?? step;
};

export const errorLabel = (code: string | null | undefined) => {
  const stages: Record<string, string> = {
    provider_connect_timeout: '连接建立超时',
    provider_first_output_timeout: '等待首有效输出超时',
    provider_output_idle_timeout: '有效输出停顿超时',
    provider_completion_timeout: '非流式完成等待超时',
    tool_timeout: '数据工具执行超时',
    task_budget_exhausted: '任务总预算已耗尽',
    execution_lease_lost: '执行所有权已失效',
    upstream_timeout: '上游返回超时',
    cancelled: '任务已取消',
    queue_expired: '排队等待已过期',
    deadline_expired: '任务执行期限已到',
  };
  const stage = stages[(code ?? '').replace(/^research_/u, '')];
  if (stage) return stage;
  const labels: Record<string, string> = {
    tool_unavailable: '数据工具不可用',
    result_contract_invalid: '结果契约校验失败',
    provider_completion_failed: 'Provider 执行失败',
    provider_unavailable: 'Provider 未配置或不可用',
    research_execution_failed: '研究执行失败',
    worker_lease_expired: 'Worker 租约过期，任务已重试',
    worker_lease_exhausted: 'Worker 多次失败，已停止重试',
  };
  return labels[code ?? ''] ?? '研究未能完成';
};
