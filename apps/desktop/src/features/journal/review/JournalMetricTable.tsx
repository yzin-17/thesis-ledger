import type { JournalDeterministicReview } from '@thesis-ledger/schemas';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  behaviorLabels,
  behaviorStatusLabels,
  evidenceLabel,
  metricLabels,
  metricText,
  type JournalDecimalMetric,
} from './journal-review-display.js';

export function JournalMetricTable({ metrics }: { metrics: Record<string, JournalDecimalMetric> }) {
  return (
    <Table frame="plain">
      <TableHeader>
        <TableRow>
          <TableHead>指标</TableHead>
          <TableHead className="text-right">值</TableHead>
          <TableHead>证据说明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(metrics).map(([key, metric]) => (
          <TableRow key={key}>
            <TableCell>{metricLabels[key] ?? key}</TableCell>
            <TableCell className="text-right font-mono tabular-nums whitespace-normal break-all">
              {metricText(metric)}
            </TableCell>
            <TableCell className="whitespace-normal">
              {metric.missingEvidence.map(evidenceLabel).join('；') || '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function JournalDecimalResult({
  result,
  showSavedAiReference = true,
}: {
  result: JournalDeterministicReview;
  showSavedAiReference?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <JournalPlanActualTable metrics={result.metrics} />
      <JournalMetricTable
        metrics={Object.fromEntries(
          Object.entries(result.metrics).filter(
            ([key]) => !comparisonKeys.has(key) && !key.startsWith('counterfactual'),
          ),
        )}
      />
      <div className="flex flex-wrap gap-2">
        {result.behaviors.map((row) => (
          <Badge key={row.code} variant="secondary">
            {behaviorLabels[row.code]}：{behaviorStatusLabels[row.status]}
          </Badge>
        ))}
      </div>
      {Object.keys(result.metrics).some((key) => key.startsWith('counterfactual')) && (
        <section className="flex min-w-0 flex-col gap-2" aria-label="反事实假设结果">
          <Separator />
          <h4 className="font-medium">反事实假设</h4>
          <p className="text-sm text-muted-foreground">
            按计划止损价退出的假设计算，不是实际成交或实际收益。
          </p>
          <JournalMetricTable
            metrics={Object.fromEntries(
              Object.entries(result.metrics).filter(([key]) => key.startsWith('counterfactual')),
            )}
          />
        </section>
      )}
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">计算口径与假设</summary>
        <div className="flex flex-col gap-2 py-3 text-sm leading-6">
          {[...new Set([...result.behaviorNotes, ...result.assumptions])].map((note) => (
            <p key={note}>{note}</p>
          ))}
          <p className="text-xs text-muted-foreground">
            金额和比例按 HALF_UP 保留最多 8 位小数；成交数量保留原始精度。
          </p>
        </div>
      </details>
      {showSavedAiReference && result.aiExplanation && (
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium">
            保存时的模型运行信息
          </summary>
          <p className="break-all py-3 text-xs text-muted-foreground">
            保存时的 AI 任务：{result.aiExplanation.id}；Provider：{result.aiExplanation.provider}
            ；模型：{result.aiExplanation.model}；Prompt：{result.aiExplanation.promptVersion}
          </p>
        </details>
      )}
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">完整复盘结果字段</summary>
        <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
          {JSON.stringify(result, null, 2)}
        </pre>
      </details>
    </div>
  );
}

const comparisonRows = [
  {
    label: '入场价格',
    keys: [
      'plannedEntryPrice',
      'actualEntryPrice',
      'entryPriceDeviation',
      'entryPriceDeviationRatio',
    ],
  },
  {
    label: '退出价格',
    keys: ['plannedExitPrice', 'actualExitPrice', 'exitPriceDeviation', 'exitPriceDeviationRatio'],
  },
  { label: '持有天数', keys: ['plannedHoldingDays', 'actualHoldingDays', 'holdingDayDeviation'] },
  { label: '止损执行', keys: ['plannedStopPrice', 'actualExitPrice', 'stopExitDeviation'] },
];
const comparisonKeys = new Set(comparisonRows.flatMap((row) => row.keys));

function MetricValue({ metric }: { metric: JournalDecimalMetric | undefined }) {
  if (!metric) return <span>未记录</span>;
  return (
    <div className="flex flex-col gap-1">
      <span className="break-words font-mono tabular-nums">{metricText(metric)}</span>
      {metric.missingEvidence.length > 0 && (
        <span className="text-xs leading-5 text-muted-foreground">
          {metric.missingEvidence.map(evidenceLabel).join('；')}
        </span>
      )}
    </div>
  );
}

function JournalPlanActualTable({ metrics }: { metrics: JournalDeterministicReview['metrics'] }) {
  return (
    <Table frame="plain" aria-label="计划与实际对照" className="min-w-[32rem]">
      <TableHeader>
        <TableRow>
          {['项目', '计划', '实际', '偏差'].map((title) => (
            <TableHead key={title}>{title}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {comparisonRows
          .filter((row) => row.keys.some((key) => metrics[key]))
          .map((row) => (
            <TableRow key={row.label}>
              <TableCell className="align-top">{row.label}</TableCell>
              {row.keys.slice(0, 2).map((key) => (
                <TableCell key={key} className="whitespace-normal align-top">
                  <MetricValue metric={metrics[key]} />
                </TableCell>
              ))}
              <TableCell className="whitespace-normal align-top">
                <div className="flex flex-col gap-2">
                  {row.keys.slice(2).map((key) => (
                    <MetricValue key={key} metric={metrics[key]} />
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
      </TableBody>
    </Table>
  );
}
