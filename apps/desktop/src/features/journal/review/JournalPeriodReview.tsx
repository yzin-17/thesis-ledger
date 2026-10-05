import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  journalPeriodReviewRequestSchema,
  type JournalPeriodReviewResult,
  type JournalPeriodReviewResponse,
} from '@thesis-ledger/schemas';
import { journalReviewWindow } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getDesktopApiClient } from '@/shared/api/client';
import { JournalMetricTable } from './JournalMetricTable.js';
import { JournalRequestError } from './JournalReviewFeedback.js';
import { evidenceLabel } from './journal-review-display.js';
import { JournalPeriodAiExplanation } from './JournalPeriodAiExplanation.js';

const presetLabels = { '7': '最近 7 天', '30': '最近 30 天', custom: '自定义窗口' };
function recentWindow(days: number) {
  const end = new Date();
  return { start: new Date(end.getTime() - days * 86400000).toISOString(), end: end.toISOString() };
}
function PeriodGroup({
  title,
  group,
  onSelect,
}: {
  title: string;
  group: JournalPeriodReviewResult['tradeCycles'];
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          窗口内 {group.observedSampleCount} 个对象，{group.includedObjectIds.length} 个符合资格，
          {group.excluded.length} 个排除。
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <JournalMetricTable metrics={group.metrics} />
        <details>
          <summary className="cursor-pointer">查看样本与排除原因</summary>
          <div className="mt-3 flex flex-col gap-2">
            {group.includedObjectIds.map((id) => (
              <Button
                key={id}
                variant="outline"
                className="justify-start overflow-hidden"
                onClick={() => onSelect(id)}
              >
                <span className="truncate">{id}</span>
              </Button>
            ))}
            {group.excluded.map((row) => (
              <div key={row.reviewObjectId}>
                <Button
                  variant="ghost"
                  className="max-w-full justify-start overflow-hidden"
                  onClick={() => onSelect(row.reviewObjectId)}
                >
                  <span className="truncate">{row.reviewObjectId}</span>
                </Button>
                <p className="text-sm text-muted-foreground">
                  {row.reasons.map(evidenceLabel).join('；')}
                </p>
              </div>
            ))}
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
export function JournalPeriodReview({
  accountId,
  mode,
  symbol,
  onSelect,
}: {
  accountId: string;
  mode: 'actual' | 'shadow';
  symbol: string;
  onSelect: (id: string) => void;
}) {
  const [preset, setPreset] = useState<keyof typeof presetLabels>('7');
  const [window, setWindow] = useState(() => recentWindow(7));
  const [completed, setCompleted] = useState<{
    data: JournalPeriodReviewResponse;
    sequence: number;
  }>();
  const sequence = useRef(0);
  const analysis = useMutation({
    mutationFn: async () => {
      const current = ++sequence.current;
      const request = journalPeriodReviewRequestSchema.safeParse({
        accountId,
        mode,
        ...window,
        ...(symbol ? { symbol } : {}),
      });
      if (!request.success) throw new Error('请输入带时区的有效开始和结束时间');
      journalReviewWindow(request.data);
      const data = await getDesktopApiClient().journalReviews.period(request.data);
      return { data, sequence: current };
    },
    onSuccess: setCompleted,
  });
  const result = completed?.data.result;
  const changed =
    result !== undefined &&
    (result.window.start !== window.start || result.window.end !== window.end);
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup>
        <Field>
          <FieldLabel>统计窗口</FieldLabel>
          <Select
            value={preset}
            onValueChange={(next) => {
              if (next !== '7' && next !== '30' && next !== 'custom') return;
              setPreset(next);
              if (next !== 'custom') setWindow(recentWindow(Number(next)));
            }}
          >
            <SelectTrigger aria-label="统计窗口">
              <SelectValue>{presetLabels[preset]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(presetLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel>开始时间（含边界，ISO 8601）</FieldLabel>
          <Input
            aria-label="周期开始时间"
            value={window.start}
            onChange={(event) => {
              setPreset('custom');
              setWindow({ ...window, start: event.target.value });
            }}
          />
        </Field>
        <Field>
          <FieldLabel>结束时间（不含边界，ISO 8601）</FieldLabel>
          <Input
            aria-label="周期结束时间"
            value={window.end}
            onChange={(event) => {
              setPreset('custom');
              setWindow({ ...window, end: event.target.value });
            }}
          />
        </Field>
      </FieldGroup>
      <Button
        className="self-start"
        disabled={analysis.isPending}
        onClick={() => analysis.mutate()}
      >
        {analysis.isPending ? '分析中…' : '分析周期'}
      </Button>
      {analysis.isError && <JournalRequestError title="周期分析未完成" error={analysis.error} />}
      {result && (
        <>
          <p className="break-all text-sm text-muted-foreground">
            本次结果窗口：[{result.window.start}, {result.window.end})
          </p>
          <PeriodGroup title="完整交易周期统计" group={result.tradeCycles} onSelect={onSelect} />
          <PeriodGroup title="单次减仓统计" group={result.closeSlices} onSelect={onSelect} />
          {result.unknownTime.length > 0 && (
            <details>
              <summary>时间未知的样本（{result.unknownTime.length}）</summary>
              {result.unknownTime.map((row) => (
                <p className="mt-2 break-all text-sm" key={row.reviewObjectId}>
                  {row.reviewObjectId}：{row.reasons.map(evidenceLabel).join('；')}
                </p>
              ))}
            </details>
          )}
          {result.assumptions.map((note) => (
            <p className="text-sm text-muted-foreground" key={note}>
              {note}
            </p>
          ))}
          {changed && (
            <p className="text-sm text-muted-foreground">
              窗口已修改，重新分析后可提交对应的 AI 解读。
            </p>
          )}
          {completed && (
            <JournalPeriodAiExplanation
              key={completed.sequence}
              analysis={completed.data}
              disabled={changed || analysis.isPending}
            />
          )}
        </>
      )}
    </div>
  );
}
