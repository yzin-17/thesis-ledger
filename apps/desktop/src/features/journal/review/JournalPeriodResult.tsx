import type { JournalPeriodReviewResult } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { evidenceLabel, metricLabels, metricText } from './journal-review-display.js';

type Group = JournalPeriodReviewResult['tradeCycles'];
type Props = { result: JournalPeriodReviewResult; onSelect?: ((id: string) => void) | undefined };

/** 当前分析与冻结快照消费同一结果，不重算统计。 */
export function JournalPeriodResult({ result, onSelect }: Props) {
  const groups = [
    { title: '完整交易周期', group: result.tradeCycles, prefix: 'TRADE_CYCLE:' },
    { title: '单次减仓', group: result.closeSlices, prefix: 'CLOSE_SLICE:' },
  ];
  const keys = [
    ...new Set(['sampleCount', ...groups.flatMap(({ group }) => Object.keys(group.metrics))]),
  ];
  const empty = groups.every(
    ({ group }) =>
      group.metrics.sampleCount.status === 'AVAILABLE' && group.metrics.sampleCount.value === '0',
  );
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <Table frame="plain" aria-label="两种统计粒度对照" className="min-w-[30rem]">
        <TableHeader>
          <TableRow>
            <TableHead>指标</TableHead>
            {groups.map(({ title }) => (
              <TableHead key={title}>{title}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {keys
            .filter((key) => !empty || key === 'sampleCount')
            .map((key) => (
              <TableRow key={key}>
                <TableCell className="align-top">{metricLabels[key] ?? key}</TableCell>
                {groups.map(({ title, group }) => (
                  <TableCell key={title} className="whitespace-normal align-top">
                    {key === 'sampleCount' ? (
                      <span className="font-mono font-semibold tabular-nums">
                        {metricText(group.metrics.sampleCount)}
                      </span>
                    ) : (
                      <PeriodMetric group={group} name={key} />
                    )}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          {['观测对象', '排除对象'].map((label, index) => (
            <TableRow key={label}>
              <TableCell>{label}</TableCell>
              {groups.map(({ title, group }) => (
                <TableCell key={title} className="font-mono tabular-nums">
                  {index === 0 ? group.observedSampleCount : group.excluded.length}
                </TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow>
            <TableCell>时间未知</TableCell>
            {groups.map(({ title, prefix }) => (
              <TableCell key={title} className="font-mono tabular-nums">
                {result.unknownTime.filter((row) => row.reviewObjectId.startsWith(prefix)).length}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>
      {empty && (
        <p role="status" className="text-sm leading-6">
          两种粒度均无合格样本，无法计算胜率、盈亏比和平均持有天数。
        </p>
      )}
      <div className="flex flex-col gap-3">
        {groups.map(({ title, group }) => (
          <details key={title}>
            <summary className="cursor-pointer py-2 text-sm font-medium">
              {title} · 样本与排除原因
            </summary>
            <div className="flex flex-col gap-3 py-3">
              {!group.includedObjectIds.length && !group.excluded.length && (
                <p className="text-sm text-muted-foreground">窗口内没有此粒度的已知时间样本。</p>
              )}
              {group.includedObjectIds.map((id) => (
                <Sample key={id} id={id} onSelect={onSelect} />
              ))}
              {group.excluded.map((row) => (
                <div key={row.reviewObjectId} className="flex flex-col gap-1">
                  <Sample id={row.reviewObjectId} onSelect={onSelect} />
                  <p className="text-sm leading-6 text-muted-foreground">
                    {row.reasons.map(evidenceLabel).join('；')}
                  </p>
                </div>
              ))}
            </div>
          </details>
        ))}
        {result.unknownTime.length > 0 && (
          <details>
            <summary className="cursor-pointer py-2 text-sm font-medium">
              时间未知的样本（{result.unknownTime.length}）
            </summary>
            <div className="flex flex-col gap-3 py-3">
              {result.unknownTime.map((row) => (
                <div key={row.reviewObjectId}>
                  <Sample id={row.reviewObjectId} onSelect={onSelect} />
                  <p className="text-sm text-muted-foreground">
                    {row.reasons.map(evidenceLabel).join('；')}
                  </p>
                </div>
              ))}
            </div>
          </details>
        )}
        <details>
          <summary className="cursor-pointer py-2 text-sm font-medium">
            统计口径与完整冻结字段
          </summary>
          <div className="flex flex-col gap-2 py-3 text-sm leading-6">
            {result.assumptions.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
          <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-all text-xs">
            {JSON.stringify(result, null, 2)}
          </pre>
        </details>
      </div>
    </div>
  );
}

function PeriodMetric({ group, name }: { group: Group; name: string }) {
  const metric = group.metrics[name as keyof Group['metrics']];
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

function Sample({ id, onSelect }: { id: string; onSelect: Props['onSelect'] }) {
  if (!onSelect) return <p className="break-all text-sm">{id}</p>;
  return (
    <Button
      variant="outline"
      className="h-auto max-w-full justify-start whitespace-normal py-2 text-left"
      onClick={() => onSelect(id)}
    >
      <span className="break-all">{id}</span>
    </Button>
  );
}
