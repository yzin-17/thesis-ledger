import type { OperationView, ProposalView } from './authoring.api.js';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { authoringFailureMessage } from './authoring-operation-feedback.js';

const statusLabels: Record<string, string> = {
  queued: '等待领取',
  running: '正在生成',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
const kindLabels = { analyze: '分析描述', generate: '生成定义', modify: '局部修改' };
const proposalLabels: Record<string, string> = {
  applied: '已应用',
  discarded: '已放弃',
  expired: '已过期',
};
const resultLabels: Record<string, string> = {
  received: '已收到响应',
  not_sent: '未发送',
  unknown: '结果未知',
};
type Props = {
  operation: OperationView;
  proposal?: ProposalView | undefined;
  busy: boolean;
  stale: boolean;
  onAction: (
    action: 'cancel' | 'apply-analysis' | 'apply-generation' | 'proposal' | 'discard',
  ) => void;
  onProposal: (action: 'apply' | 'discard') => void;
};
function costLabel(outcome: OperationView['outcome']) {
  if (!outcome) return '费用尚无实际事实';
  if (outcome.cost.status === 'unknown') return '费用未知，可能已发生调用';
  if (outcome.cost.amount === null) return '费用尚无实际事实';
  return `${outcome.cost.amount} ${outcome.cost.currency ?? ''}（${outcome.cost.status === 'estimated' ? '配置估算' : '上游报告'}）`;
}
function OperationFacts({ outcome }: { outcome: OperationView['outcome'] }) {
  return (
    <>
      <p className="text-sm">
        {costLabel(outcome)}
        {outcome ? ` · ${resultLabels[outcome.externalResult] ?? '等待确认'}` : ''}
      </p>
      {outcome?.usage?.status === 'reported' && (
        <p className="text-xs text-muted-foreground">
          实际用量：输入 {outcome.usage.inputTokens ?? '未知'} / 输出{' '}
          {outcome.usage.outputTokens ?? '未知'} tokens
        </p>
      )}
      {outcome?.errorCode && (
        <p role="alert">{authoringFailureMessage(outcome.errorCode, outcome.externalResult)}</p>
      )}
    </>
  );
}
function OperationProposal({
  proposal,
  applicable,
  busy,
  onProposal,
}: {
  proposal: ProposalView;
  applicable: boolean;
  busy: boolean;
  onProposal: Props['onProposal'];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p>修改意图：{proposal.payload.intent}</p>
      {proposal.payload.differences.map((difference) => (
        <div key={difference.path} className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          <p className="text-sm sm:col-span-2">位置：{difference.path}</p>
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            原规则：{difference.before}
          </pre>
          <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
            建议：{difference.after}
          </pre>
        </div>
      ))}
      {proposal.status === 'pending' && applicable && (
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy} onClick={() => onProposal('apply')}>
            确认应用修改
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onProposal('discard')}>
            放弃修改建议
          </Button>
        </div>
      )}
      {proposal.status !== 'pending' && <p>建议{proposalLabels[proposal.status] ?? '已结束'}。</p>}
    </div>
  );
}
export function AuthoringOperation(props: Props) {
  const control = authoringOperationMaterials(props);
  const {
    resolved,
    selection,
    statusLabel,
    operation,
    outcome,
    stale,
    active,
    busy,
    onAction,
    applicable,
    proposal,
    onProposal,
  } = control;

  return (
    <section
      className={cn(
        'flex min-w-0 flex-col gap-3',
        resolved ? 'border-b pb-4' : 'rounded-md bg-muted/50 p-4',
      )}
      aria-label="当前编写操作"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">{kindLabels[selection.kind]}</h3>
          <Badge variant="secondary">{statusLabel}</Badge>
        </div>
        <p className="break-all text-xs text-muted-foreground">
          {selection.providerId} / {selection.model} · 输入修订 {operation.revision}
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <OperationFacts outcome={outcome} />
        {stale && !resolved && <p className="text-sm">当前草稿已有新修订，此结果只供追溯。</p>}
        {active && (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onAction('cancel')}
          >
            取消当前操作
          </Button>
        )}
        {applicable && selection.kind !== 'modify' && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={busy}
              onClick={() =>
                onAction(selection.kind === 'analyze' ? 'apply-analysis' : 'apply-generation')
              }
            >
              确认应用{selection.kind === 'analyze' ? '分析' : '生成'}结果
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onAction('discard')}>
              放弃此结果
            </Button>
          </div>
        )}
        {applicable && selection.kind === 'modify' && !proposal && (
          <Button disabled={busy} onClick={() => onAction('proposal')}>
            查看修改建议
          </Button>
        )}
        {proposal && (
          <OperationProposal
            proposal={proposal}
            applicable={applicable}
            busy={busy}
            onProposal={onProposal}
          />
        )}
        {(outcome?.outputText || outcome?.errorCode) && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">
              原始响应与诊断
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {[outcome.errorCode, outcome.outputText].filter(Boolean).join('\n')}
            </pre>
          </details>
        )}
      </div>
    </section>
  );
}

function authoringOperationMaterials({
  operation,
  proposal,
  busy,
  stale,
  onAction,
  onProposal,
}: Props) {
  const active = ['queued', 'running'].includes(operation.status);
  const applicable =
    operation.status === 'succeeded' && operation.disposition === 'unapplied' && !stale;
  const outcome = operation.outcome;
  const selection = operation.input.selection;
  const resolved = operation.disposition === 'applied' || operation.disposition === 'discarded';
  let statusLabel = statusLabels[operation.status] ?? '状态待确认';
  if (operation.disposition === 'applied') statusLabel = '已应用';
  else if (operation.disposition === 'discarded') statusLabel = '已放弃';

  return {
    resolved,
    selection,
    statusLabel,
    operation,
    outcome,
    stale,
    active,
    busy,
    onAction,
    applicable,
    proposal,
    onProposal,
  };
}
