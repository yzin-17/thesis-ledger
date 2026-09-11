import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Account } from '../portfolio/portfolio.types.js';
import {
  fetchStrategyRiskApplications,
  updateStrategyRiskApplication,
} from '../strategy/strategy-optimization.api.js';

const strategyRiskApplicationsKey = ['desktop', 'strategy', 'risk-applications'] as const;

export function StrategyRiskApplicationsSection({
  accounts,
  onOpenStrategy,
}: {
  accounts: Account[];
  onOpenStrategy: () => void;
}) {
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: strategyRiskApplicationsKey,
    queryFn: () => fetchStrategyRiskApplications(),
  });
  const toggle = useMutation({
    mutationFn: (input: { id: string; revision: number; enabled: boolean }) =>
      updateStrategyRiskApplication(input.id, {
        expectedRevision: input.revision,
        enabled: input.enabled,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: strategyRiskApplicationsKey });
    },
  });

  if (applications.isPending) {
    return <p className="text-sm text-muted-foreground">正在读取策略来源风险应用…</p>;
  }
  if (applications.isError) {
    return (
      <div className="space-y-2 rounded-md border p-4">
        <p className="text-sm text-muted-foreground">策略来源风险应用读取失败。</p>
        <Button size="sm" variant="outline" onClick={() => void applications.refetch()}>
          重试
        </Button>
      </div>
    );
  }
  if ((applications.data?.length ?? 0) === 0) {
    return (
      <div className="space-y-2 rounded-md border p-4">
        <div className="font-medium">暂无策略来源风险应用</div>
        <p className="text-sm text-muted-foreground">
          在策略实验的“优化与风险”中预览并确认后，应用会在这里保留来源版本与修订。
        </p>
        <Button size="sm" variant="outline" onClick={onOpenStrategy}>
          前往策略实验
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {applications.data?.map((application) => {
        const account = accounts.find((item) => item.id === application.accountId);
        return (
          <div
            key={application.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{application.symbol}</span>
                <Badge variant="outline">策略来源</Badge>
                <Badge variant={application.enabled ? 'default' : 'outline'}>
                  {application.enabled ? '实际监控中' : '已停用'}
                </Badge>
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {account?.name ?? application.accountId} · 应用修订 r{application.revision} · 覆盖{' '}
                {application.coverage.riskMapped}/{application.coverage.riskTotal}
              </div>
              <div className="mt-1 break-all text-xs text-muted-foreground">
                来源策略版本 {application.strategyVersionId}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={onOpenStrategy}>
                查看来源/升级
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={toggle.isPending}
                onClick={() =>
                  toggle.mutate({
                    id: application.id,
                    revision: application.revision,
                    enabled: !application.enabled,
                  })
                }
              >
                {application.enabled ? '停用实际监控' : '启用实际监控'}
              </Button>
            </div>
          </div>
        );
      })}
      {toggle.isError ? (
        <p className="text-sm text-destructive">
          {toggle.error instanceof Error ? toggle.error.message : '更新策略风险应用失败'}
        </p>
      ) : null}
    </div>
  );
}
