import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

export function AutomationReadWarning({
  warnings,
}: {
  warnings: readonly { source: string; code: string }[] | undefined;
}) {
  if (!warnings?.length) return null;
  return (
    <Alert>
      <AlertTitle>收费资料检查记录暂时无法读取</AlertTitle>
      <AlertDescription>
        当前显示的历史不包含收费资料检查，其他任务记录已保留。请稍后刷新。
      </AlertDescription>
    </Alert>
  );
}
