import { Badge } from '@/components/ui/badge';
import { formatDateTimeInTimeZone } from '@/lib/date-display';
import { aiProviderConnectionLabel, projectAiProviderStatus } from '@thesis-ledger/domain';
import type { ProviderRecord } from './providers.types.js';

const healthVariant = (health: string) => {
  if (health === 'down') return 'destructive' as const;
  if (health === 'healthy') return 'outline' as const;
  return 'secondary' as const;
};

export function AiProviderReadinessStatus({ provider }: { provider: ProviderRecord }) {
  const status = projectAiProviderStatus(provider.executionRoutes);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1">
        <Badge variant={healthVariant(provider.health)}>
          {aiProviderConnectionLabel(provider.health)}
        </Badge>
        <Badge variant={status.tone}>{status.label}</Badge>
        <Badge variant={status.testTone}>{status.testLabel}</Badge>
      </div>
      {status.routes.some((route) => route.reasons.length > 0 || route.budgetPending) && (
        <ul className="flex w-full min-w-0 flex-col gap-2">
          {status.routes.map((route, index) => (
            <li key={index} className="min-w-0 whitespace-normal wrap-anywhere">
              <span className="text-foreground">
                {route.model} · {route.purpose} {route.version}
              </span>
              <span className="block">
                {route.readinessLabel}
                {route.readinessLabel === '配置待处理' && route.budgetPending && '；待任务费用授权'}
                {route.validationLabel !== status.testLabel && `；${route.validationLabel}`}
              </span>
              {route.reasons.length > 0 && (
                <span className="block">{route.reasons.join('；')}。</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {status.budgetNote && <span>{status.budgetNote}</span>}
      {provider.checkedAt && (
        <span>
          最近连接测试 {formatDateTimeInTimeZone(provider.checkedAt, 'Asia/Shanghai')}
          {provider.latencyMs == null ? '' : ` · ${provider.latencyMs}ms`}
        </span>
      )}
      {provider.errorCode && <span>{provider.errorCode}</span>}
      {provider.configError && <span>{provider.configError}</span>}
    </div>
  );
}
