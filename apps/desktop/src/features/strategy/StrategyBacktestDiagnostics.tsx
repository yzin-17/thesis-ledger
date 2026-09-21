import { useMemo, useState } from 'react';
import { Copy, Download } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';
import {
  buildBacktestDiagnosticExport,
  buildBacktestDiagnosticSummary,
  type BacktestDiagnosticExport,
} from './strategy-backtest-diagnostics.model.js';
import type { BacktestJob, BacktestJobResult } from './strategy.types.js';

type DiagnosticField = { label: string; value: unknown };

const displayDiagnosticDateTime = (value: unknown) =>
  typeof value === 'string' ? formatDateTime(value, '未记录') : '未记录';

const displayDiagnosticDate = (value: unknown) =>
  typeof value === 'string' ? formatDateOnly(value, '未记录') : '未记录';

const displayExecutionModel = (
  model: BacktestDiagnosticExport['frozenConfiguration']['executionModel'],
) => ({
  ...model,
  rangeStart: displayDiagnosticDate(model.rangeStart),
  rangeEnd: displayDiagnosticDate(model.rangeEnd),
});

const valueText = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '未记录';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return JSON.stringify(value, null, 2);
};

const compactValue = (value: unknown) => {
  const text = valueText(value);
  if (text.length <= 32) return text;
  return `${text.slice(0, 10)}…${text.slice(-6)}`;
};

const diagnosticGroups = (payload: BacktestDiagnosticExport) => [
  {
    title: '策略与任务',
    fields: [
      { label: '任务 ID', value: payload.identity.jobId },
      { label: '运行 ID', value: payload.identity.runId },
      { label: '策略版本 ID', value: payload.identity.strategyVersionId },
      { label: '任务模式', value: payload.identity.mode },
      { label: '任务状态', value: payload.identity.status },
      { label: '执行阶段', value: payload.identity.stage },
      {
        label: '请求区间',
        value: {
          start: displayDiagnosticDate(payload.identity.period.start),
          end: displayDiagnosticDate(payload.identity.period.end),
        },
      },
      { label: '创建时间', value: displayDiagnosticDateTime(payload.identity.createdAt) },
      { label: '开始时间', value: displayDiagnosticDateTime(payload.identity.startedAt) },
      { label: '完成时间', value: displayDiagnosticDateTime(payload.identity.finishedAt) },
    ],
  },
  {
    title: '数据与执行',
    fields: [
      {
        label: '数据冻结时点',
        value: displayDiagnosticDateTime(payload.frozenConfiguration.dataAsOf),
      },
      { label: '基准币种', value: payload.frozenConfiguration.baseCurrency },
      { label: '初始资金', value: payload.frozenConfiguration.initialCash },
      { label: '估值策略', value: payload.frozenConfiguration.valuationPolicy },
      {
        label: '执行模型摘要',
        value: displayExecutionModel(payload.frozenConfiguration.executionModel),
      },
      { label: '数据快照 ID', value: payload.traceability.snapshotId },
      { label: '执行模型哈希', value: payload.traceability.executionModelHash },
      { label: '市场规则版本', value: payload.traceability.marketRuleVersion },
      { label: '交易日历版本', value: payload.traceability.calendarVersion },
      { label: '聚合版本', value: payload.traceability.aggregationVersion },
    ],
  },
  {
    title: '结果与校验',
    fields: [
      { label: '结果完整性', value: payload.outcome.completeness },
      { label: '指标与不可用原因', value: payload.outcome.metrics },
      { label: '警告与缺口说明', value: payload.outcome.warnings },
      { label: '失败信息', value: payload.outcome.failure },
      { label: '引擎版本', value: payload.traceability.engineVersion },
      { label: '内容哈希', value: payload.traceability.contentHash },
      { label: '结果校验和', value: payload.traceability.resultChecksum },
    ],
  },
];

function DiagnosticValue({
  field,
  copiedLabel,
  onCopy,
}: {
  field: DiagnosticField;
  copiedLabel: string | null;
  onCopy: (label: string, value: string) => void;
}) {
  const fullValue = valueText(field.value);
  const canExpand = fullValue.length > 32 || fullValue.includes('\n');
  return (
    <div className="min-w-0 rounded-md border bg-muted/10 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{field.label}</p>
          <p className="break-all font-mono text-xs">{compactValue(field.value)}</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-label={`复制${field.label} 完整值`}
          onClick={() => onCopy(field.label, fullValue)}
        >
          <Copy />
          {copiedLabel === field.label ? '已复制' : '复制'}
        </Button>
      </div>
      {canExpand && (
        <details className="mt-2 text-xs">
          <summary className="cursor-pointer text-muted-foreground">查看完整值</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 font-mono">
            {fullValue}
          </pre>
        </details>
      )}
    </div>
  );
}

export function StrategyBacktestDiagnostics({
  job,
  result,
}: {
  job: BacktestJob;
  result: BacktestJobResult;
}) {
  const payload = useMemo(() => buildBacktestDiagnosticExport(job, result), [job, result]);
  const groups = useMemo(() => diagnosticGroups(payload), [payload]);
  const [copyMessage, setCopyMessage] = useState('');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);

  const copyValue = async (label: string, value: string) => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard) throw new Error('unavailable');
      await navigator.clipboard.writeText(value);
      setCopiedLabel(label);
      setCopyMessage(`${label}已复制完整值。`);
    } catch {
      setCopiedLabel(null);
      setCopyMessage('复制失败，请展开完整值后手动复制。');
    }
  };

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    );
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `backtest-${job.id}-diagnostics-v${payload.formatVersion}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-medium">诊断与复现</h3>
        <p className="text-sm text-muted-foreground">
          技术字段用于核对任务身份、冻结配置与结果一致性；哈希存在不代表历史事实充分或一定可复现。
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => void copyValue('诊断摘要', buildBacktestDiagnosticSummary(payload))}
        >
          <Copy />
          {copiedLabel === '诊断摘要' ? '诊断摘要已复制' : '复制诊断摘要'}
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={download}>
          <Download />
          导出诊断 JSON
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {copyMessage}
      </p>
      {groups.map((group) => (
        <details key={group.title} className="rounded-lg border" open={group.title === '策略与任务'}>
          <summary className="cursor-pointer px-4 py-3 font-medium">{group.title}</summary>
          <div className="grid gap-2 border-t p-4 sm:grid-cols-2">
            {group.fields.map((field) => (
              <DiagnosticValue
                key={field.label}
                field={field}
                copiedLabel={copiedLabel}
                onCopy={(label, value) => void copyValue(label, value)}
              />
            ))}
          </div>
        </details>
      ))}
      <Alert>
        <AlertTitle>此导出不是完整复现包</AlertTitle>
        <AlertDescription>
          {payload.reproduction.note} 仍需：{payload.reproduction.requiredArtifacts.join('、')}。
        </AlertDescription>
      </Alert>
    </div>
  );
}
