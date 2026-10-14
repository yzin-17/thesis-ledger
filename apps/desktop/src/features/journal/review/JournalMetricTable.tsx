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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>指标</TableHead>
          <TableHead>值</TableHead>
          <TableHead>证据说明</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {Object.entries(metrics).map(([key, metric]) => (
          <TableRow key={key}>
            <TableCell>{metricLabels[key] ?? key}</TableCell>
            <TableCell className="font-mono tabular-nums whitespace-normal break-all">
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

export function JournalDecimalResult({ result }: { result: JournalDeterministicReview }) {
  return (
    <div className="flex flex-col gap-4">
      {result.aiExplanation && (
        <p className="break-all text-xs text-muted-foreground">
          保存时的 AI 任务：{result.aiExplanation.id}；Provider：{result.aiExplanation.provider}
          ；模型：{result.aiExplanation.model}；Prompt：{result.aiExplanation.promptVersion}
        </p>
      )}
      <JournalMetricTable metrics={result.metrics} />
      <div className="flex flex-wrap gap-2">
        {result.behaviors.map((row) => (
          <Badge key={row.code} variant="secondary">
            {behaviorLabels[row.code]}：{behaviorStatusLabels[row.status]}
          </Badge>
        ))}
      </div>
      <Alert>
        <AlertTitle>计算口径与反事实假设</AlertTitle>
        <AlertDescription>
          {[...result.behaviorNotes, ...result.assumptions].map((note) => (
            <p key={note}>{note}</p>
          ))}
          <p>金额和比例按 HALF_UP 保留最多 8 位小数；成交数量保留原始精度。</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}
