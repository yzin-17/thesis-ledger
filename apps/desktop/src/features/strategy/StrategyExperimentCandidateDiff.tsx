import type { OptimizationCandidate } from './strategy-optimization.api.js';
import { strategyDiffValueSummary } from './strategy-version-summary.model.js';

const fieldLabels: Record<string, string> = {
  name: '策略名称',
  description: '策略说明',
  entry: '入场条件',
  exit: '退出条件',
  risk: '风险规则',
  sizing: '仓位规则',
  cost: '交易成本',
  execution: '执行方式',
  executionInstrument: '执行标的',
  signalSources: '信号来源',
  primaryTimeframe: '主周期',
  conditions: '条件',
  expression: '表达式',
  type: '规则类型',
  percent: '比例',
  amount: '金额',
  quantity: '数量',
  weight: '目标权重',
  periods: '持有周期',
  commissionRate: '佣金率',
  slippageRate: '滑点率',
};

function fieldLabel(entry: Record<string, unknown>) {
  if (typeof entry.label === 'string') return entry.label;
  if (typeof entry.path === 'string')
    return (
      entry.path
        .replace(/^\$\.?/, '')
        .split('.')
        .map((part) => fieldLabels[part] ?? part)
        .join(' · ') || '策略定义'
    );
  if (typeof entry.parameterId === 'string') return entry.parameterId;
  return '策略定义';
}

function DiffValue({ value, path }: { value: unknown; path: string }) {
  if (value === undefined) return <p className="text-sm text-muted-foreground">未设置</p>;
  if (value === null) return <p className="text-sm text-muted-foreground">空值</p>;
  const summary = strategyDiffValueSummary(path, value);
  const complex = typeof value === 'object';
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  if (!complex) return <p className="break-words text-sm leading-relaxed">{text || '空文本'}</p>;
  const definition = (
    <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/30 p-3 font-mono text-xs leading-relaxed">
      {text}
    </pre>
  );
  if (!summary) return definition;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="break-words text-sm leading-relaxed">{summary}</p>
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">查看完整定义</summary>
        {definition}
      </details>
    </div>
  );
}

export function ExperimentDefinitionDiffEntries({
  entries,
  beforeLabel = '基线',
  afterLabel = '候选',
}: {
  entries: ReadonlyArray<Record<string, unknown>>;
  beforeLabel?: string;
  afterLabel?: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      {entries.map((entry, index) => {
        const path = typeof entry.path === 'string' ? entry.path : '';
        if (entry.status === 'unchanged')
          return (
            <p key={index} className="text-sm text-muted-foreground">
              候选与实验冻结的基线定义一致。
            </p>
          );
        if (entry.status === 'unavailable' || (entry.kind === 'full-strategy' && !path))
          return (
            <p key={index} className="text-sm text-muted-foreground">
              {typeof entry.reason === 'string'
                ? entry.reason
                : '此记录只有完整策略标记，尚无可读取的具体差异。'}
            </p>
          );
        return (
          <div
            key={`${path}:${index}`}
            className="flex min-w-0 flex-col gap-2 border-t pt-3 first:border-t-0 first:pt-0"
          >
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1">
              <h4 className="text-sm font-medium">{fieldLabel(entry)}</h4>
              {path && <code className="break-all text-xs text-muted-foreground">{path}</code>}
            </div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">{beforeLabel}</p>
                <DiffValue path={path} value={entry.before} />
              </div>
              <div className="flex min-w-0 flex-col gap-1">
                <p className="text-xs text-muted-foreground">{afterLabel}</p>
                <DiffValue path={path} value={entry.after} />
              </div>
            </div>
          </div>
        );
      })}
      {entries.length === 0 && <p className="text-sm text-muted-foreground">没有差异。</p>}
    </div>
  );
}

export function ExperimentCandidateDiff({ candidate }: { candidate: OptimizationCandidate }) {
  const full = candidate.diff.some((entry) => entry.kind === 'full-strategy');
  return (
    <details className="min-w-0 border-t border-border py-4">
      <summary className="cursor-pointer select-none py-2 text-sm font-medium">
        候选 {candidate.candidateNumber} · {full ? '查看完整策略差异' : '查看完整参数差异'}
      </summary>
      <div className="mt-3">
        <ExperimentDefinitionDiffEntries entries={candidate.diff} />
      </div>
    </details>
  );
}
