import { useEffect, useId, useState } from 'react';
import type { ResearchReportSummary } from '@thesis-ledger/schemas';
import {
  Card,
  CardAction,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel, FieldDescription } from '@/components/ui/field';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectItem,
} from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useResearchComparisonQuery, useResearchIdentity } from './research.queries.js';
import { reportEvidenceLocator } from './research-report-display.js';
import {
  researchComparisonChoiceLabel,
  type ResearchComparisonChoice,
} from './research-comparison-display.js';
import { ResearchComparisonResult } from './ResearchComparisonResult.js';

const AUTO = 'default-previous';
type Props = {
  report: ResearchReportSummary;
  choices: ResearchComparisonChoice[];
  contextKey?: string;
};
function ComparisonReadState({ query }: { query: ReturnType<typeof useResearchComparisonQuery> }) {
  if (query.isFetching || query.isPending)
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="正在读取报告比较">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <Alert variant="destructive">
        <AlertTitle>比较暂不可用</AlertTitle>
        <AlertDescription>报告不存在、访问权限已变化或读取未能完成。请重新读取。</AlertDescription>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
          重新读取比较
        </Button>
      </Alert>
    );
  if (!query.data) return null;
  return (
    <ResearchComparisonResult
      key={`${query.data.current.id}:${query.data.previous?.id ?? ''}`}
      value={query.data}
    />
  );
}
function ComparisonBody({ report, choices }: Props) {
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [selection, setSelection] = useState<string | null>(null);
  const candidates = choices.filter((choice) => choice.id !== report.id);
  const beforeId = candidates.some((choice) => choice.id === selection) ? selection : null;
  useEffect(() => {
    if (selection && beforeId === null) setSelection(null);
  }, [selection, beforeId]);
  const locator =
    report.historicalScope.status === 'known'
      ? reportEvidenceLocator(report.historicalScope.snapshot)
      : { view: 'legacy' as const };
  const query = useResearchComparisonQuery(report.id, locator, beforeId, open);
  const items = [
    { value: AUTO, label: '默认前序' },
    ...candidates.map((choice) => ({
      value: choice.id,
      label: researchComparisonChoiceLabel(choice),
    })),
  ];
  return (
    <Card role="region" aria-label="报告比较">
      <CardHeader>
        <CardTitle>报告比较</CardTitle>
        <CardDescription>选择另一份已存报告，核对保存的字段和证据变化。</CardDescription>
        <CardAction>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? '收起比较' : '比较已存报告'}
          </Button>
        </CardAction>
      </CardHeader>
      {open && (
        <>
          <CardContent className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={fieldId}>对比报告</FieldLabel>
                <Select
                  items={items}
                  value={beforeId ?? AUTO}
                  onValueChange={(value) => setSelection(value === AUTO ? null : value)}
                >
                  <SelectTrigger id={fieldId} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {items.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FieldDescription>
                  可选当前已加载列表中的 {candidates.length}{' '}
                  份其他成功报告；默认前序由保存范围确定。
                </FieldDescription>
              </Field>
            </FieldGroup>
            <ComparisonReadState query={query} />
          </CardContent>
          <CardFooter>
            <p className="text-xs text-muted-foreground">比较使用保存版本，文字变化按原文展示。</p>
          </CardFooter>
        </>
      )}
    </Card>
  );
}
export function ResearchComparison(props: Props) {
  const owner = useResearchIdentity();
  const locator =
    props.report.historicalScope.status === 'known'
      ? reportEvidenceLocator(props.report.historicalScope.snapshot)
      : { view: 'legacy' };
  const key = JSON.stringify([owner, props.contextKey, props.report.id, locator]);
  return <ComparisonBody key={key} {...props} />;
}
