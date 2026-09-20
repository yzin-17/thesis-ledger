import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { strategySchemaV2 } from '@thesis-ledger/schemas';
import { AlertTriangle, ArrowLeft, Bell, ExternalLink, ShieldCheck } from 'lucide-react';
import { Link, useBeforeUnload, useBlocker, useNavigate, useParams } from 'react-router';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch, SwitchThumb } from '@/components/ui/switch';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';
import { fetchAccounts } from '../portfolio/portfolio.api.js';
import { accountDisplayLabel } from '../portfolio/portfolio.types.js';
import { NotificationRouteSelect } from '../risk/NotificationRouteSelect.js';
import { useNotificationRoutingQuery } from '../risk/risk.queries.js';
import {
  createStrategyRiskApplication,
  fetchStrategyRiskApplications,
  previewStrategyRiskApplication,
  type RiskApplicationPreview,
  type StrategyRiskNotification,
} from './strategy-optimization.api.js';
import {
  strategyCenterPath,
  strategyCenterFocusState,
  strategyCenterTriggerId,
  findStrategyVersion,
} from './strategy-center.navigation.js';
import {
  enabledRiskConflict,
  matchingRiskApplications,
  parseCooldownMinutes,
  riskApplicationFingerprint,
  riskCenterApplicationPath,
  type RiskCycleMode,
} from './strategy-risk-application.model.js';
import {
  strategyComparisonOperatorLabel,
  strategyMonitoringCoverageSourceLabel,
  strategyMonitoringMetricLabel,
  strategyRiskCycleModeLabel,
  strategyRiskCycleModeOptions,
  strategyRiskEvaluationStateLabel,
  strategyRiskNotificationSeverityLabel,
  strategyRiskNotificationSeverityOptions,
  strategyTimeframeLabel,
} from './strategy-display-labels.js';
import type { StrategyRecord } from './strategy.types.js';

const riskApplicationKey = ['desktop', 'strategy', 'risk-applications'] as const;

type PreviewState = {
  data: RiskApplicationPreview;
  fingerprint: string;
};

export function StrategyRiskApplicationPage({
  strategies,
  presentation = 'page',
}: {
  strategies: StrategyRecord[];
  presentation?: 'page' | 'drawer';
}) {
  const { strategyId, versionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const toast = useToastManager();
  const source = findStrategyVersion(strategies, strategyId, versionId);
  const parsed = source?.version.schema ? strategySchemaV2.safeParse(source.version.schema) : null;
  const symbol = parsed?.success ? parsed.data.executionInstrument.symbol : '';
  const [accountId, setAccountId] = useState('');
  const [cycleMode, setCycleMode] = useState<RiskCycleMode>('existingAndFuture');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationSeverity, setNotificationSeverity] =
    useState<StrategyRiskNotification['severity']>('warning');
  const [cooldownMinutes, setCooldownMinutes] = useState('60');
  const [notificationChannel, setNotificationChannel] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewInvalidated, setPreviewInvalidated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const [dirty, setDirty] = useState(false);
  const [closeRequested, setCloseRequested] = useState(false);
  const allowNavigationRef = useRef(false);
  const blocker = useBlocker(() => dirty && !allowNavigationRef.current);
  useBeforeUnload(
    (event) => {
      if (!dirty || allowNavigationRef.current) return;
      event.preventDefault();
    },
    { capture: true },
  );
  useEffect(() => {
    if (blocker.state === 'blocked') setCloseRequested(true);
  }, [blocker.state]);
  const accounts = useQuery({
    queryKey: ['desktop', 'accounts'],
    queryFn: () => fetchAccounts(),
  });
  const notificationRouting = useNotificationRoutingQuery();
  const notificationRoutes = notificationRouting.data?.routes ?? [];
  let notificationRoutingState: 'loading' | 'ready' | 'error' = 'ready';
  if (notificationRouting.isPending) notificationRoutingState = 'loading';
  else if (notificationRouting.isError) notificationRoutingState = 'error';
  const selectedNotificationRoute = notificationRoutes.find(
    (route) => route.channel === notificationChannel,
  );
  useEffect(() => {
    if (notificationRoutingState !== 'ready' || selectedNotificationRoute) return;
    const nextChannel = notificationRoutes[0]?.channel ?? '';
    setNotificationChannel(nextChannel);
    if (!nextChannel) setNotificationEnabled(false);
  }, [notificationRoutes, notificationRoutingState, selectedNotificationRoute]);
  const actualAccounts = (accounts.data ?? []).filter(
    (account) => account.mode === 'actual' && account.active !== false && account.type !== 'cash',
  );
  const selectedAccount = actualAccounts.find((account) => account.id === accountId);
  useEffect(() => {
    if (!accountId && actualAccounts[0]) setAccountId(actualAccounts[0].id);
  }, [accountId, actualAccounts]);
  const currentFingerprint = riskApplicationFingerprint({
    strategyVersionId: source?.version.id ?? '',
    accountId,
    symbol,
    cycleMode,
  });
  useEffect(() => {
    if (!preview || preview.fingerprint === currentFingerprint) return;
    setPreview(null);
    setPreviewInvalidated(true);
    setIdempotencyKey(crypto.randomUUID());
  }, [currentFingerprint, preview]);
  const applications = useQuery({
    queryKey: [...riskApplicationKey, accountId, symbol],
    queryFn: () => fetchStrategyRiskApplications(accountId, symbol),
    enabled: Boolean(accountId && symbol),
  });
  const currentApplications = applications.data ?? [];
  const sameIdentity = source
    ? matchingRiskApplications(currentApplications, {
        strategyVersionId: source.version.id,
        accountId,
        symbol,
        cycleMode,
      })
    : [];
  const sameIdentityIds = useMemo(
    () => new Set(sameIdentity.map((application) => application.id)),
    [sameIdentity],
  );
  const enabledConflict = enabledRiskConflict(currentApplications, {
    accountId,
    symbol,
    matchingIds: sameIdentityIds,
  });
  const previewMutation = useMutation({
    mutationFn: () => {
      if (!source || !accountId || !symbol) throw new Error('请选择可用账户');
      return previewStrategyRiskApplication({
        strategyVersionId: source.version.id,
        accountId,
        symbol,
        cycleMode,
      });
    },
    onSuccess: (data) => {
      setPreview({ data, fingerprint: currentFingerprint });
      setPreviewInvalidated(false);
      setIdempotencyKey(crypto.randomUUID());
      setDirty(true);
    },
    onError: (error) =>
      toast.add({
        title: '预览失败',
        description: error instanceof Error ? error.message : '请稍后重试',
        type: 'error',
      }),
  });
  const createMutation = useMutation({
    mutationFn: (enabled: boolean) => {
      const cooldown = parseCooldownMinutes(cooldownMinutes);
      if (!source || !preview || preview.fingerprint !== currentFingerprint)
        throw new Error('当前配置需要重新预览');
      if (cooldown === null) throw new Error('通知冷却时间必须是 0 到 10080 的整数');
      if (notificationEnabled && !selectedNotificationRoute)
        throw new Error('请先选择已配置的通知 Provider');
      return createStrategyRiskApplication({
        strategyVersionId: source.version.id,
        accountId,
        symbol,
        cycleMode,
        previewHash: preview.data.previewHash,
        idempotencyKey,
        enabled,
        notification: {
          enabled: notificationEnabled,
          cooldownMinutes: cooldown,
          severity: notificationSeverity,
          channels:
            notificationEnabled && selectedNotificationRoute
              ? [selectedNotificationRoute.channel as StrategyRiskNotification['channels'][number]]
              : [],
        },
      });
    },
    onSuccess: async (application) => {
      await queryClient.invalidateQueries({ queryKey: riskApplicationKey });
      toast.add({
        title: application.applicationResolution ? '已定位已有风险应用' : '风险应用已保存',
        description: application.enabled ? '应用当前已启用。' : '应用已保存为停用。',
      });
      setDirty(false);
      allowNavigationRef.current = true;
      const sourcePath = source
        ? strategyCenterPath.strategyVersion(source.strategy.id, source.version.id)
        : strategyCenterPath.library;
      void navigate(`${sourcePath}?riskApplicationId=${encodeURIComponent(application.id)}`, {
        state: strategyCenterFocusState(strategyCenterTriggerId.riskApplication),
      });
    },
    onError: async (error) => {
      await applications.refetch();
      const message = error instanceof Error ? error.message : '请刷新状态后重试';
      if (message.includes('预览') && (message.includes('过期') || message.includes('重新'))) {
        setPreview(null);
        setPreviewInvalidated(true);
        setIdempotencyKey(crypto.randomUUID());
      }
      toast.add({
        title: '保存风险应用失败',
        description: message,
        type: 'error',
      });
    },
  });

  if (!source) {
    return (
      <Alert variant="destructive">
        <AlertTitle>找不到策略版本</AlertTitle>
        <AlertDescription>当前地址没有对应的策略和版本，请返回策略库重新选择。</AlertDescription>
      </Alert>
    );
  }
  if (!parsed?.success || source.version.version <= 0) {
    return (
      <div className="space-y-4">
        <Button
          nativeButton={false}
          render={
            <Link to={strategyCenterPath.strategyVersion(source.strategy.id, source.version.id)}>
              <ArrowLeft aria-hidden="true" />
              返回策略版本
            </Link>
          }
          variant="ghost"
          size="sm"
          className="-ml-2"
        />
        <Alert>
          <AlertTitle>当前版本不能生成风险规则</AlertTitle>
          <AlertDescription>
            风险应用仅支持正式 V2 策略版本，当前版本仍可查看和回测。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const previewData = preview?.data ?? null;
  const previewReady = Boolean(preview && preview.fingerprint === currentFingerprint);
  const previewPositionId =
    typeof previewData?.context.positionId === 'string'
      ? previewData.context.positionId
      : '当前无持仓';
  const submitDisabled =
    createMutation.isPending ||
    !previewReady ||
    sameIdentity.length > 0 ||
    (notificationEnabled && !selectedNotificationRoute);
  const sourcePath = strategyCenterPath.strategyVersion(source.strategy.id, source.version.id);
  const requestClose = () => {
    if (dirty) {
      setCloseRequested(true);
      return;
    }
    allowNavigationRef.current = true;
    void navigate(sourcePath, {
      state: strategyCenterFocusState(strategyCenterTriggerId.riskApplication),
    });
  };
  const discardAndClose = () => {
    setDirty(false);
    setCloseRequested(false);
    allowNavigationRef.current = true;
    if (blocker.state === 'blocked') {
      blocker.proceed();
      return;
    }
    void navigate(sourcePath, {
      state: strategyCenterFocusState(strategyCenterTriggerId.riskApplication),
    });
  };
  const saveActions = (
    <>
      <Button
        variant="outline"
        disabled={submitDisabled}
        onClick={() => createMutation.mutate(false)}
      >
        保存为停用
      </Button>
      <Button
        disabled={submitDisabled || Boolean(enabledConflict)}
        onClick={() => createMutation.mutate(true)}
      >
        确认启用
      </Button>
    </>
  );

  const content = (
    <div className="space-y-4">
      {presentation === 'page' ? (
        <>
          <Button
            nativeButton={false}
            render={
              <Link to={sourcePath}>
                <ArrowLeft aria-hidden="true" />
                返回策略版本
              </Link>
            }
            variant="ghost"
            size="sm"
            className="-ml-2"
          />
          <div>
            <p className="text-sm text-muted-foreground">
              策略中心 / {source.strategy.name} v{source.version.version} / 生成风险规则
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">生成风险规则</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              来源：{source.strategy.name} v{source.version.version} · {symbol} ·{' '}
              {strategyTimeframeLabel(parsed.data.primaryTimeframe)}
            </p>
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>应用配置</CardTitle>
          <CardDescription>
            选择账户和生效范围后预览。策略版本与执行标的固定为当前来源。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(260px,2fr)]">
            <Field>
              <FieldLabel>实际证券账户</FieldLabel>
              <Select
                value={accountId}
                onValueChange={(value) => {
                  if (!value) return;
                  setAccountId(value);
                  setDirty(true);
                }}
              >
                <SelectTrigger aria-label="实际证券账户" className="w-full">
                  <SelectValue placeholder="选择账户">
                    {selectedAccount ? accountDisplayLabel(selectedAccount) : '选择账户'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {actualAccounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {accountDisplayLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>现金账户与模拟账户不参与实际风险应用。</FieldDescription>
            </Field>
            <Field>
              <FieldLabel>生效范围</FieldLabel>
              <Select
                value={cycleMode}
                onValueChange={(value) => {
                  if (!value) return;
                  setCycleMode(value);
                  setDirty(true);
                }}
              >
                <SelectTrigger aria-label="生效范围" className="w-full">
                  <SelectValue>{strategyRiskCycleModeLabel(cycleMode)}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {strategyRiskCycleModeOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-medium">
                  <Bell className="size-4" aria-hidden="true" />
                  通知
                </div>
                <p className="mt-1 text-xs text-muted-foreground">使用已配置的通知服务商路由。</p>
              </div>
              <Switch
                checked={notificationEnabled}
                onCheckedChange={(checked) => {
                  setNotificationEnabled(checked);
                  setDirty(true);
                }}
                disabled={!notificationEnabled && !selectedNotificationRoute}
                variant="risk"
                aria-label="风险通知"
              >
                <SwitchThumb variant="risk" aria-hidden="true" />
              </Switch>
            </div>
            <details className="mt-3 border-t pt-3">
              <summary className="cursor-pointer select-none text-sm font-medium">
                高级通知设置
              </summary>
              <div className="mt-4 grid gap-4 md:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1.2fr)_minmax(240px,1fr)] md:items-start">
                <Field>
                  <FieldLabel>严重级别</FieldLabel>
                  <Select
                    value={notificationSeverity}
                    onValueChange={(value) => {
                      if (!value) return;
                      setNotificationSeverity(value);
                      setDirty(true);
                    }}
                  >
                    <SelectTrigger aria-label="通知严重级别" className="w-full">
                      <SelectValue>
                        {strategyRiskNotificationSeverityLabel(notificationSeverity)}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {strategyRiskNotificationSeverityOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel>冷却时间（分钟）</FieldLabel>
                  <Input
                    value={cooldownMinutes}
                    type="number"
                    min="0"
                    max="10080"
                    onChange={(event) => {
                      setCooldownMinutes(event.target.value);
                      setDirty(true);
                    }}
                  />
                </Field>
                <Field>
                  <FieldLabel>通知渠道</FieldLabel>
                  <NotificationRouteSelect
                    routes={notificationRoutes}
                    routingState={notificationRoutingState}
                    value={notificationChannel}
                    onValueChange={(value) => {
                      setNotificationChannel(value);
                      setDirty(true);
                    }}
                    ariaLabel="通知渠道"
                  />
                </Field>
              </div>
            </details>
          </div>

          {accounts.isPending ? (
            <p className="text-sm text-muted-foreground">正在读取账户…</p>
          ) : null}
          {actualAccounts.length === 0 && !accounts.isPending ? (
            <Alert>
              <AlertTitle>没有可用实际证券账户</AlertTitle>
              <AlertDescription>请先在账户数据中创建并启用实际证券账户。</AlertDescription>
            </Alert>
          ) : null}
          {previewInvalidated ? (
            <Alert>
              <AlertTitle>配置已经变化</AlertTitle>
              <AlertDescription>旧预览已失效，请按当前账户和生效范围重新预览。</AlertDescription>
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">来源 v{source.version.version}</Badge>
            <Badge variant="outline">执行标的 {symbol}</Badge>
            <Button
              variant="outline"
              disabled={!accountId || previewMutation.isPending || sameIdentity.length > 0}
              onClick={() => previewMutation.mutate()}
            >
              {previewMutation.isPending ? '正在预览…' : '预览风险规则'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {sameIdentity.length > 0 ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>
            {sameIdentity.length === 1 ? '同源应用已存在' : '发现多条同源历史记录'}
          </AlertTitle>
          <AlertDescription className="space-y-2">
            <p>
              {sameIdentity.length === 1
                ? '相同策略版本、账户、标的和生效范围复用已有记录。通知配置请在已有应用中显式编辑。'
                : '系统不会自动选择、合并或删除记录。请选择一条进入风险中心管理。'}
            </p>
            <div className="flex flex-wrap gap-2">
              {sameIdentity.map((application) => (
                <Button
                  key={application.id}
                  nativeButton={false}
                  render={
                    <Link to={riskCenterApplicationPath(application.id)}>
                      查看 r{application.revision}
                      <ExternalLink aria-hidden="true" />
                    </Link>
                  }
                  variant="outline"
                  size="sm"
                />
              ))}
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {enabledConflict ? (
        <Alert>
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>该账户与标的已有启用中的应用</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>可以先保存为停用。启用前请显式处理已有应用，系统不会自动替换。</span>
            <Button
              nativeButton={false}
              render={
                <Link to={riskCenterApplicationPath(enabledConflict.id)}>
                  管理已有应用
                  <ExternalLink aria-hidden="true" />
                </Link>
              }
              variant="outline"
              size="sm"
            />
          </AlertDescription>
        </Alert>
      ) : null}

      {previewData ? (
        <Card>
          <CardHeader>
            <CardTitle>规则预览</CardTitle>
            <CardDescription>
              已映射 {previewData.plan.coverage.riskMapped}/{previewData.plan.coverage.riskTotal}{' '}
              项风险约束。保存后按所选状态进入风险中心管理。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">账户上下文</div>
                <div className="mt-1 font-medium">
                  {selectedAccount ? accountDisplayLabel(selectedAccount) : '账户不可用'}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">持仓</div>
                <div className="mt-1 font-medium">{previewPositionId}</div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-xs text-muted-foreground">生效范围</div>
                <div className="mt-1 font-medium">{strategyRiskCycleModeLabel(cycleMode)}</div>
              </div>
            </div>
            <div className="space-y-2">
              {previewData.plan.rules.map((rule) => {
                const evaluation = previewData.evaluations.find(
                  (item) => item.sourceKey === rule.sourceKey,
                );
                return (
                  <div
                    key={rule.sourceKey}
                    className="flex flex-wrap items-start justify-between gap-3 rounded-md border p-3"
                  >
                    <div>
                      <div className="font-medium">{rule.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {strategyMonitoringMetricLabel(rule.metric)}{' '}
                        {strategyComparisonOperatorLabel(rule.operator)} {rule.threshold} ·{' '}
                        {strategyTimeframeLabel(rule.evaluationTimeframe)}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {strategyRiskEvaluationStateLabel(evaluation?.state)}
                    </Badge>
                    {evaluation?.reason ? (
                      <p className="w-full text-xs text-muted-foreground">{evaluation.reason}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="rounded-md border bg-muted/20 p-3">
              <div className="text-sm font-medium">未转换条件</div>
              <div className="mt-2 space-y-1">
                {previewData.plan.coverage.items
                  .filter((item) => item.status !== 'mapped')
                  .map((item) => (
                    <p
                      key={`${item.category}:${item.source}`}
                      className="text-xs text-muted-foreground"
                    >
                      {strategyMonitoringCoverageSourceLabel(item.source)}：{item.reason}
                    </p>
                  ))}
              </div>
            </div>
            {presentation === 'page' ? (
              <div className="flex flex-wrap justify-end gap-2">{saveActions}</div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );

  if (presentation === 'drawer') {
    return (
      <Sheet
        open
        triggerId={strategyCenterTriggerId.riskApplication}
        onOpenChange={(open) => !open && requestClose()}
      >
        <SheetContent
          size="detail"
          className="overflow-hidden"
          finalFocus={() => document.getElementById(strategyCenterTriggerId.riskApplication)}
        >
          <SheetHeader>
            <SheetTitle>生成风险规则</SheetTitle>
            <SheetDescription>
              来源固定为 {source.strategy.name} v{source.version.version} · {symbol} ·{' '}
              {strategyTimeframeLabel(parsed.data.primaryTimeframe)}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto">{content}</div>
          {closeRequested || previewData ? (
            <SheetFooter>
              {closeRequested ? (
                <div className="mr-auto flex min-w-full flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
                  <span>当前配置或预览尚未保存，关闭后会丢失。</span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setCloseRequested(false);
                        if (blocker.state === 'blocked') blocker.reset();
                      }}
                    >
                      继续编辑
                    </Button>
                    <Button variant="destructive" size="sm" onClick={discardAndClose}>
                      放弃并关闭
                    </Button>
                  </div>
                </div>
              ) : (
                saveActions
              )}
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  return content;
}
