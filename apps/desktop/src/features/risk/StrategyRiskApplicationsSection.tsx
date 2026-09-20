import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { GitCompareArrows, MoreHorizontal, Trash2 } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { Account } from '../portfolio/portfolio.types.js';
import { strategyCenterPath } from '../strategy/strategy-center.navigation.js';
import { strategyRiskCycleModeLabel } from '../strategy/strategy-display-labels.js';
import {
  deleteStrategyRiskApplication,
  fetchStrategyRiskApplications,
  previewStrategyRiskApplicationUpgrade,
  updateStrategyRiskApplication,
  upgradeStrategyRiskApplication,
  type RiskApplicationUpgradePreview,
  type StrategyRiskApplication,
  type StrategyRiskNotification,
} from '../strategy/strategy-optimization.api.js';
import { fetchStrategies } from '../strategy/strategy.api.js';
import { strategyKeys } from '../strategy/strategy.queries.js';
import type { StrategyRecord, StrategyVersion } from '../strategy/strategy.types.js';
import {
  RiskApplicationNotificationEditor,
  RiskApplicationUpgradeReview,
} from './StrategyRiskApplicationEditors.js';
import { riskKeys } from './risk.queries.js';

const strategyRiskApplicationsKey = ['desktop', 'strategy', 'risk-applications'] as const;

const sourceVersion = (strategies: StrategyRecord[], versionId: string) => {
  for (const strategy of strategies) {
    const version = strategy.versions.find((candidate) => candidate.id === versionId);
    if (version) return { strategy, version };
  }
  return null;
};

const latestFormalVersion = (
  strategy: StrategyRecord | undefined,
  current: StrategyVersion | undefined,
) => {
  if (!strategy || !current) return null;
  return (
    strategy.versions
      .filter((version) => version.version > current.version && version.schemaVersion === 2)
      .sort((left, right) => right.version - left.version)[0] ?? null
  );
};

export function StrategyRiskApplicationsSection({ accounts }: { accounts: Account[] }) {
  const queryClient = useQueryClient();
  const { confirm } = useConfirmDialog();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedApplicationId = searchParams.get('applicationId');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [upgradePreview, setUpgradePreview] = useState<{
    applicationId: string;
    targetVersion: StrategyVersion;
    data: RiskApplicationUpgradePreview;
    idempotencyKey: string;
  } | null>(null);
  const applications = useQuery({
    queryKey: strategyRiskApplicationsKey,
    queryFn: () => fetchStrategyRiskApplications(),
  });
  const strategies = useQuery({
    queryKey: strategyKeys.strategies(),
    queryFn: () => fetchStrategies(),
    staleTime: 10_000,
  });
  useEffect(() => {
    if (!selectedApplicationId || !applications.data) return;
    window.requestAnimationFrame(() => {
      document
        .getElementById(`strategy-risk-application-${selectedApplicationId}`)
        ?.scrollIntoView({ block: 'center' });
    });
  }, [applications.data, selectedApplicationId]);
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: strategyRiskApplicationsKey }),
      queryClient.invalidateQueries({ queryKey: riskKeys.rules() }),
    ]);
  };
  const update = useMutation({
    mutationFn: (input: {
      id: string;
      revision: number;
      enabled?: boolean;
      notification?: StrategyRiskNotification;
    }) =>
      updateStrategyRiskApplication(input.id, {
        expectedRevision: input.revision,
        ...(input.enabled === undefined ? {} : { enabled: input.enabled }),
        ...(input.notification === undefined ? {} : { notification: input.notification }),
      }),
    onSuccess: async () => {
      setFeedback('风险应用已更新。');
      await invalidate();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : '更新策略风险应用失败'),
  });
  const remove = useMutation({
    mutationFn: (application: StrategyRiskApplication) =>
      deleteStrategyRiskApplication(application.id, application.revision),
    onSuccess: async (application) => {
      if (selectedApplicationId === application.id) {
        const next = new URLSearchParams(searchParams);
        next.delete('applicationId');
        setSearchParams(next, { replace: true });
      }
      setFeedback('风险应用已删除，相关实际监控已停止。');
      await invalidate();
    },
    onError: (error) => setFeedback(error instanceof Error ? error.message : '删除风险应用失败'),
  });
  const previewUpgrade = useMutation({
    mutationFn: (input: { applicationId: string; targetVersion: StrategyVersion }) =>
      previewStrategyRiskApplicationUpgrade(input.applicationId, input.targetVersion.id),
    onSuccess: (data, input) => {
      setUpgradePreview({
        applicationId: input.applicationId,
        targetVersion: input.targetVersion,
        data,
        idempotencyKey: crypto.randomUUID(),
      });
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : '风险应用升级预览失败'),
  });
  const confirmUpgrade = useMutation({
    mutationFn: () => {
      if (!upgradePreview) throw new Error('请先生成升级预览');
      return upgradeStrategyRiskApplication(upgradePreview.applicationId, {
        expectedRevision: upgradePreview.data.currentRevision,
        targetStrategyVersionId: upgradePreview.targetVersion.id,
        previewHash: upgradePreview.data.previewHash,
        idempotencyKey: upgradePreview.idempotencyKey,
      });
    },
    onSuccess: async (application) => {
      setUpgradePreview(null);
      setFeedback(`风险应用已升级，当前修订 r${application.revision}。`);
      await invalidate();
    },
    onError: (error) =>
      setFeedback(error instanceof Error ? error.message : '升级失败，请刷新后重新预览'),
  });
  const openApplication = (applicationId: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('tab', 'strategy-applications');
    next.set('applicationId', applicationId);
    setSearchParams(next, { replace: true });
  };
  const closeApplication = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('applicationId');
    setSearchParams(next, { replace: true });
  };
  const confirmRemove = async (application: StrategyRiskApplication) => {
    if (
      !(await confirm({
        title: `删除 ${application.symbol} 的风险应用？`,
        description: '删除后会立即停止实际监控，并从风险中心移除。历史来源与审计记录仍会保留。',
        confirmLabel: '删除应用',
        cancelLabel: '取消',
        variant: 'destructive',
      }))
    )
      return;
    remove.mutate(application);
  };

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
          从策略库的具体正式版本进入“生成风险规则”，预览并确认后会在这里管理。
        </p>
        <Button
          nativeButton={false}
          render={<Link to={strategyCenterPath.library}>前往策略库</Link>}
          size="sm"
          variant="outline"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {applications.data?.map((application) => {
        const account = accounts.find((item) => item.id === application.accountId);
        const source = sourceVersion(strategies.data ?? [], application.strategyVersionId);
        const latest = latestFormalVersion(source?.strategy, source?.version);
        const selected = selectedApplicationId === application.id;
        const currentUpgrade =
          upgradePreview?.applicationId === application.id ? upgradePreview : null;
        return (
          <div
            id={`strategy-risk-application-${application.id}`}
            key={application.id}
            className={
              selected
                ? 'space-y-4 rounded-lg border border-primary/50 bg-card p-4 ring-2 ring-primary/10'
                : 'space-y-4 rounded-lg border bg-card p-4'
            }
          >
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-semibold">{application.symbol}</span>
                  <Badge variant="outline">策略来源</Badge>
                  <Badge variant={application.enabled ? 'default' : 'outline'}>
                    {application.enabled ? '实际监控中' : '已停用'}
                  </Badge>
                  {application.archivedAt ? <Badge variant="secondary">已归档</Badge> : null}
                </div>
                <div className="text-sm text-muted-foreground">
                  {account?.name ?? application.accountId} · 应用修订 r{application.revision} ·{' '}
                  {strategyRiskCycleModeLabel(application.cycleMode)} · 覆盖{' '}
                  {application.coverage.riskMapped}/{application.coverage.riskTotal}
                </div>
                <div className="text-sm text-muted-foreground">
                  来源：
                  {source ? (
                    <Link
                      className="ml-1 font-medium text-foreground underline-offset-4 hover:underline"
                      to={strategyCenterPath.strategyVersion(source.strategy.id, source.version.id)}
                    >
                      {source.strategy.name} v{source.version.version}
                    </Link>
                  ) : (
                    <span className="ml-1">版本信息暂不可用</span>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {latest && !application.archivedAt ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={previewUpgrade.isPending}
                    onClick={() =>
                      previewUpgrade.mutate({
                        applicationId: application.id,
                        targetVersion: latest,
                      })
                    }
                  >
                    <GitCompareArrows aria-hidden="true" />
                    预览升级到 v{latest.version}
                  </Button>
                ) : null}
                <Button
                  size="sm"
                  variant="outline"
                  disabled={update.isPending || Boolean(application.archivedAt)}
                  onClick={() =>
                    update.mutate({
                      id: application.id,
                      revision: application.revision,
                      enabled: !application.enabled,
                    })
                  }
                >
                  {application.enabled ? '停用实际监控' : '启用实际监控'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={Boolean(application.archivedAt)}
                  onClick={() => (selected ? closeApplication() : openApplication(application.id))}
                >
                  {selected ? '收起通知配置' : '编辑通知配置'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="icon-sm" variant="ghost" aria-label="风险应用更多操作">
                        <MoreHorizontal aria-hidden="true" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      variant="destructive"
                      disabled={remove.isPending || Boolean(application.archivedAt)}
                      onClick={() => void confirmRemove(application)}
                    >
                      <Trash2 aria-hidden="true" />
                      删除应用
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
            {selected && !application.archivedAt ? (
              <RiskApplicationNotificationEditor
                application={application}
                pending={update.isPending}
                onSave={(notification) =>
                  update.mutate({
                    id: application.id,
                    revision: application.revision,
                    notification,
                  })
                }
              />
            ) : null}
            {currentUpgrade ? (
              <RiskApplicationUpgradeReview
                application={application}
                targetVersion={currentUpgrade.targetVersion}
                preview={currentUpgrade.data}
                pending={confirmUpgrade.isPending}
                onConfirm={() => confirmUpgrade.mutate()}
                onOpenExisting={(applicationId) => {
                  setUpgradePreview(null);
                  openApplication(applicationId);
                }}
              />
            ) : null}
          </div>
        );
      })}
      {feedback ? <p className="text-sm text-muted-foreground">{feedback}</p> : null}
    </div>
  );
}
