import { Badge } from '@/components/ui/badge';
import {
  aiExecutionReadinessLabel,
  aiLiveValidationLabel,
  aiReadinessReasonLabel,
} from './ai-provider-execution.js';
import { providerHealthStateLabel, type ProviderRecord } from './providers.types.js';

const healthVariant = (health: string) => {
  if (health === 'down') return 'destructive' as const;
  if (health === 'healthy') return 'outline' as const;
  return 'secondary' as const;
};

export function AiProviderReadinessStatus({ provider }: { provider: ProviderRecord }) {
  const routes = provider.executionRoutes;
  const blocked = routes?.some((route) => route.readiness.state === 'blocked') ?? false;
  const liveFailed = routes?.some((route) => route.liveValidation.status === 'failed') ?? false;
  const livePassed =
    Boolean(routes?.length) && routes?.every((route) => route.liveValidation.status === 'passed');
  const reasons = [
    ...new Set(
      (routes ?? []).flatMap((route) =>
        route.readiness.state === 'blocked' ? route.readiness.reasons : [],
      ),
    ),
  ];
  let readinessVariant: 'destructive' | 'outline' | 'secondary' = 'secondary';
  if (blocked) readinessVariant = 'destructive';
  else if (routes?.length) readinessVariant = 'outline';
  let liveVariant: 'destructive' | 'outline' | 'secondary' = 'secondary';
  if (liveFailed) liveVariant = 'destructive';
  else if (livePassed) liveVariant = 'outline';

  return (
    <div className="flex flex-col items-start gap-1.5">
      <div className="flex flex-wrap gap-1">
        <Badge variant={healthVariant(provider.health)}>
          连接健康：{providerHealthStateLabel(provider.health)}
        </Badge>
        <Badge variant={readinessVariant}>{aiExecutionReadinessLabel(routes)}</Badge>
        <Badge variant={liveVariant}>{aiLiveValidationLabel(routes)}</Badge>
      </div>
      {reasons.length > 0 && (
        <span>{reasons.map(aiReadinessReasonLabel).join('；')}。编辑配置后会重新评估。</span>
      )}
      {provider.checkedAt && (
        <span>
          最近连接测试 {new Date(provider.checkedAt).toLocaleString('zh-CN')}
          {provider.latencyMs == null ? '' : ` · ${provider.latencyMs}ms`}
        </span>
      )}
      {provider.errorCode && <span>{provider.errorCode}</span>}
      {provider.configError && <span>{provider.configError}</span>}
    </div>
  );
}
