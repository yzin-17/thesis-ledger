import type { ReactNode } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartLineUpIcon } from '@phosphor-icons/react/ChartLineUp';
import { cn } from '@/lib/utils';
import type { LoadState } from './types.js';

export const Metric = ({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: 'positive' | 'negative';
}) => (
  <Card className="metric metric-card shadow-none ring-0">
    <CardContent className="metric-content">
      <p>{label}</p>
      <strong className={tone}>{value}</strong>
      {detail && <span>{detail}</span>}
    </CardContent>
  </Card>
);

export const StatePanel = ({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) => (
  <section className="state-panel">
    <div className="state-graphic" aria-hidden="true">
      <ChartLineUpIcon size={40} />
    </div>
    <h1>{title}</h1>
    <p>{description}</p>
    {children}
  </section>
);

export const DataStateBanner = ({
  state,
  description,
  onRetry,
}: {
  state: LoadState;
  description?: string | undefined;
  onRetry?: (() => void) | undefined;
}) => {
  if (state === 'ready') return null;
  const copy: Record<Exclude<LoadState, 'ready'>, { title: string; description: string }> = {
    loading: { title: '正在加载', description: '正在读取 ThesisLedger 数据，请稍候。' },
    empty: { title: '暂无数据', description: '完成配置或导入后，这里会显示可追溯的数据。' },
    error: { title: '数据读取失败', description: '当前内容未更新为正常值，请检查服务后重试。' },
    stale: { title: '数据可能陈旧', description: '部分来源不可用，当前结果会保留陈旧标记。' },
  };
  const displayState: Exclude<LoadState, 'ready'> = state;
  const content = copy[displayState];
  return (
    <Alert
      className={cn('data-state-banner', state)}
      role="status"
      aria-live="polite"
      aria-busy={state === 'loading'}
    >
      <AlertTitle>{content.title}</AlertTitle>
      <AlertDescription>
        <span>{description ?? content.description}</span>
      </AlertDescription>
      {onRetry && (state === 'error' || state === 'stale') && (
        <Button className="text-button" size="sm" type="button" variant="link" onClick={onRetry}>
          重新加载
        </Button>
      )}
    </Alert>
  );
};

export const DashboardSkeleton = () => (
  <div aria-label="正在加载" aria-busy="true">
    <Skeleton className="skeleton hero" />
    <div className="metrics">
      <Skeleton className="skeleton card" />
      <Skeleton className="skeleton card" />
      <Skeleton className="skeleton card" />
    </div>
    <Skeleton className="skeleton table" />
  </div>
);
