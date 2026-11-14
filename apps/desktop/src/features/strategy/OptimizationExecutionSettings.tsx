import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { useOptimizationExecutionModel } from './use-optimization-execution-model.js';

export function OptimizationExecutionSettings({
  resolution,
  discovery,
}: {
  resolution: ReturnType<typeof useOptimizationExecutionModel>;
  discovery: boolean;
}) {
  return (
    <Field>
      <FieldLabel>模拟成交设置</FieldLabel>
      {resolution.loading && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner aria-hidden="true" />
          正在自动准备成交设置…
        </p>
      )}
      {resolution.model && (
        <>
          <p className="text-sm">研究默认规则 · 已自动配置</p>
          <FieldDescription>
            {discovery
              ? '按探索标的、市场和实验区间生成。以下假设用于本次实验的模拟成交。'
              : '费用、最低佣金和滑点沿用所选策略，按本次实验区间生成。'}
          </FieldDescription>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-xs text-muted-foreground">
            {resolution.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </>
      )}
      {resolution.message && (
        <Alert variant="destructive">
          <AlertTitle>模拟成交设置暂不可用</AlertTitle>
          <AlertDescription>
            <p>{resolution.message}</p>
            <Button
              type="button"
              variant="outline"
              disabled={resolution.loading}
              onClick={resolution.retry}
            >
              重新准备成交设置
            </Button>
          </AlertDescription>
        </Alert>
      )}
    </Field>
  );
}
