import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Account } from '../portfolio/portfolio.types.js';
import {
  fetchStrategyRiskApplications,
  updateStrategyRiskApplication,
  type StrategyRiskApplication,
} from '../strategy/strategy-optimization.api.js';
import { createRiskRule } from './risk.api.js';
import { riskKeys } from './risk.queries.js';

const strategyRiskApplicationsKey = ['desktop', 'strategy', 'risk-applications'] as const;

const copyableRules = (application: StrategyRiskApplication) =>
  application.plan.rules.filter((rule) => rule.kind === 'cost-stop' || rule.kind === 'take-profit');

export function StrategyRiskApplicationsSection({
  accounts,
  onOpenStrategy,
}: {
  accounts: Account[];
  onOpenStrategy: () => void;
}) {
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState<string | null>(null);
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
  const copy = useMutation({
    mutationFn: async (application: StrategyRiskApplication) => {
      const rules = copyableRules(application);
      if (rules.length === 0) throw new Error('当前应用没有可复制为旧手工规则的成本止损/止盈条件');
      const created = await Promise.all(
        rules.map((rule) =>
          createRiskRule({
            kind: rule.kind,
            scope: 'security',
            severity: 'warning',
            threshold: rule.kind === 'cost-stop' ? Math.abs(Number(rule.threshold)) : Number(rule.threshold),
            enabled: false,
            symbol: application.symbol,
            accountId: application.accountId,
          }),
        ),
      );
      return created.length;
    },
    onSuccess: async (count) => {
      setFeedback(`已复制 ${count} 条独立手工规则，默认保持停用；后续修改不再跟随策略版本。`);
      await queryClient.invalidateQueries({ queryKey: riskKeys.rules() });
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '复制独立规则失败'),
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
        const copyableCount = copyableRules(application).length;
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
                {application.coverage.riskMapped}/{application.coverage.riskTotal} · 通知{' '}
                {application.notification.enabled === false
                  ? '关闭'
                  : `开启 / ${application.notification.cooldownMinutes ?? 60} 分钟`}
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
                disabled={copy.isPending || copyableCount === 0}
                onClick={() => copy.mutate(application)}
              >
                复制为独立规则{copyableCount > 0 ? ` (${copyableCount})` : ''}
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
      {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
      {toggle.isError ? (
        <p className="text-sm text-destructive">
          {toggle.error instanceof Error ? toggle.error.message : '更新策略风险应用失败'}
        </p>
      ) : null}
    </div>
  );
}
