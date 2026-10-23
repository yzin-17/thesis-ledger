import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { Button } from '@/components/ui/button';
import { reviewError } from './journal-review-display.js';
import { presentRequestFailure } from '../../../shared/api/request-error.js';

export function JournalRequestError({
  title,
  error,
  retry,
}: {
  title: string;
  error: unknown;
  retry?: () => void;
}) {
  const { technical } = presentRequestFailure(error);
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p>{reviewError(error)}</p>
        {technical && (
          <details>
            <summary className="cursor-pointer text-sm">查看技术详情</summary>
            <pre className="max-h-48 overflow-auto text-xs">{JSON.stringify(technical, null, 2)}</pre>
          </details>
        )}
        {retry && (
          <Button variant="outline" onClick={retry}>
            重新读取
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
export function JournalEmpty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action}
    </Empty>
  );
}
