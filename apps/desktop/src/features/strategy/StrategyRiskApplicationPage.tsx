import { createClientRequestId } from '../../lib/client-request-id';
import { strategyInstrumentLabel } from './strategy-instrument-display.js';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState, Spinner } from '@/components/ui/spinner';
import { useEffect, useMemo, useRef, useState } from 'react';
import { requestFailureMessage } from '@/shared/api/request-error';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { strategySchema, DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES } from '@thesis-ledger/schemas';
import { AlertTriangle, ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { useDraftCloseGuard } from '../shared/useDraftCloseGuard.js';
import { useOptionalPortfolioMode } from '../portfolio/portfolio-mode-context.js';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Sheet,
  SheetContent,
  SheetBody,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useToastManager } from '@/components/ui/toast';
import { fetchAccounts } from '../portfolio/portfolio.api.js';
import { useRiskNotificationRoutingQuery } from '../risk/risk.queries.js';
import {
  createStrategyRiskApplication,
  fetchStrategyRiskApplications,
  previewStrategyRiskApplication,
  type RiskApplicationPreview,
  type StrategyRiskNotification,
  type StrategyRiskApplication,
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
  riskApplicationFingerprint,
  riskCenterApplicationPath,
  type RiskCycleMode,
} from './strategy-risk-application.model.js';
import { strategyTimeframeLabel } from './strategy-display-labels.js';
import { StrategyRiskConfiguration } from './StrategyRiskConfiguration.js';
import { StrategyRiskPreview } from './StrategyRiskPreview.js';
import { StrategyRiskRuleSettings } from './StrategyRiskRuleSettings.js';
import { buildRiskNotification, type RuleNotificationDrafts } from './strategy-risk-notification-form.js';
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
  const parsed = source?.version.schema ? strategySchema.safeParse(source.version.schema) : null;
  const symbol = parsed?.success ? parsed.data.executionInstrument.symbol : '';
  const [accountId, setAccountId] = useState('');
  const [cycleMode, setCycleMode] = useState<RiskCycleMode>('existingAndFuture');
  const [notificationEnabled, setNotificationEnabled] = useState(true);
  const [notificationSeverity, setNotificationSeverity] =
    useState<StrategyRiskNotification['severity']>('warning');
  const [cooldownMinutes, setCooldownMinutes] = useState(String(DEFAULT_RISK_NOTIFICATION_COOLDOWN_MINUTES));
  const [notificationProviders, setNotificationProviders] = useState<string[]>([]);
  const providersInitialized = useRef(false);
  const [ruleDrafts, setRuleDrafts] = useState<RuleNotificationDrafts>({});
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewInvalidated, setPreviewInvalidated] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(() => createClientRequestId());
  const [dirty, setDirty] = useState(false);
  const [savedApplicationId, setSavedApplicationId] = useState<string | null>(null);
  const allowNavigationRef = useRef(false);
  const operationBusy = useRef(false);
  const saveErrorToastId = useRef<string | null>(null);
  const requestClose = useDraftCloseGuard({
    open: true,
    dirty,
    busy: operationBusy.current,
    draft: {
      strategyId,
      versionId,
      accountId,
      cycleMode,
      notificationEnabled,
      notificationSeverity,
      cooldownMinutes,
      notificationProviders,
      ruleDrafts,
    },
    bypass: () => allowNavigationRef.current,
    discard: () => setDirty(false),
    onOpenChange: (open) => {
      if (open || !source || operationBusy.current) return;
      setDirty(false);
      allowNavigationRef.current = true;
      void navigate(strategyCenterPath.strategyVersion(source.strategy.id, source.version.id), {
        state: strategyCenterFocusState(strategyCenterTriggerId.riskApplication),
      });
    },
  });
  const accounts = useQuery({
    queryKey: ['desktop', 'accounts'],
    queryFn: () => fetchAccounts(),
  });
  const notificationRouting = useRiskNotificationRoutingQuery();
  const notificationRoutes = notificationRouting.data?.availableRoutes ?? [];
  let notificationRoutingState: 'loading' | 'ready' | 'error' = 'ready';
  if (notificationRouting.isPending) notificationRoutingState = 'loading';
  else if (notificationRouting.isError) notificationRoutingState = 'error';
  const selectedNotificationRoute = notificationProviders.length > 0 && notificationProviders.every((name) => notificationRoutes.some((route) => route.provider === name));
  useEffect(() => {
    if (notificationRoutingState !== 'ready' || providersInitialized.current) return;
    providersInitialized.current = true;
    const selected = notificationRouting.data?.selectedProviders ?? [];
    setNotificationProviders(selected);
    if (!selected.length) setNotificationEnabled(false);
  }, [notificationRoutingState, notificationRouting.data]);
  const globalMode = useOptionalPortfolioMode()?.mode ?? 'actual';
  const actualAccounts = (globalMode === 'shadow' ? [] : (accounts.data ?? [])).filter(
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
    setRuleDrafts({});
    setIdempotencyKey(createClientRequestId());
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
    onMutate: () => {
      operationBusy.current = true;
    },
    onSettled: () => {
      operationBusy.current = false;
    },
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
      setIdempotencyKey(createClientRequestId());
      setDirty(true);
    },
    onError: (error) =>
      toast.add({
        title: '预览失败',
        description: requestFailureMessage(error, '请稍后重试'),
        type: 'error',
      }),
  });
  const createMutation = useMutation({
    onMutate: () => {
      operationBusy.current = true;
      if (saveErrorToastId.current) toast.close?.(saveErrorToastId.current);
      saveErrorToastId.current = null;
    },
    onSettled: () => {
      operationBusy.current = false;
    },
    mutationFn: (enabled: boolean) => {
      if (!source || !preview || preview.fingerprint !== currentFingerprint)
        throw new Error('当前配置需要重新预览');
      if (notificationEnabled && !selectedNotificationRoute)
        throw new Error('请先选择已配置的通知提供方');
      return createStrategyRiskApplication({
        strategyVersionId: source.version.id,
        accountId,
        symbol,
        cycleMode,
        previewHash: preview.data.previewHash,
        idempotencyKey,
        enabled,
        notification: buildRiskNotification({
          enabled: notificationEnabled,
          cooldownMinutes,
          severity: notificationSeverity,
          channel: '',
          providers: notificationProviders,
        }, ruleDrafts),
      });
    },
    onSuccess: async (application) => {
      setSavedApplicationId(application.id);
      queryClient.setQueryData<StrategyRiskApplication[]>(
        [...riskApplicationKey, accountId, symbol],
        (previous = []) => [...previous.filter((item) => item.id !== application.id), application],
      );
      await queryClient.invalidateQueries({ queryKey: riskApplicationKey });
      toast.add({
        title: application.applicationResolution ? '已定位已有风险应用' : '风险应用已保存',
        description: application.enabled ? '应用当前已启用。' : '应用已保存为停用。',
      });
      setDirty(false);
      if (queryClient.getQueryState([...riskApplicationKey, accountId, symbol])?.status === 'error')
        return;
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
        setIdempotencyKey(createClientRequestId());
      }
      saveErrorToastId.current = toast.add({
        title: '保存风险应用失败',
        description: requestFailureMessage(error, '请刷新状态后重试'),
        type: 'error',
      });
    },
  });

  const busy = previewMutation.isPending || createMutation.isPending;
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
            风险应用需要可读取的正式策略版本，当前版本仍可查看和回测。
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const previewData = preview?.data ?? null;
  const previewReady = Boolean(preview && preview.fingerprint === currentFingerprint);
  const submitDisabled =
    createMutation.isPending ||
    previewMutation.isPending ||
    accounts.isError ||
    applications.isError ||
    Boolean(savedApplicationId) ||
    !previewReady ||
    sameIdentity.length > 0 ||
    (notificationEnabled && !selectedNotificationRoute);
  const sourcePath = strategyCenterPath.strategyVersion(source.strategy.id, source.version.id);
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
    <div className="flex min-w-0 flex-col gap-6">
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
            <p className="text-sm text-muted-foreground">策略中心 / 生成风险规则</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">生成风险规则</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {source.strategy.name} v{source.version.version} ·{' '}
              {strategyInstrumentLabel(source.version.instrumentDirectory, symbol)} ·{' '}
              {strategyTimeframeLabel(parsed.data.primaryTimeframe)}
            </p>
          </div>
        </>
      ) : null}

      {globalMode === 'shadow' && (
        <Alert>
          <AlertTitle>策略风险应用仅支持实际账户</AlertTitle>
          <AlertDescription>
            当前为模拟范围。请先使用全局开关切换到实际，再选择账户；已保存应用的归属不变。
          </AlertDescription>
        </Alert>
      )}
      {savedApplicationId ? (
        <Alert>
          <AlertTitle>风险应用已保存</AlertTitle>
          <AlertDescription>
            无需再次保存。当前读取恢复后，可关闭本页查看来源版本。
          </AlertDescription>
        </Alert>
      ) : null}

      <section aria-label="应用配置" className="flex min-w-0 flex-col gap-4">
        <h3 className="text-xl font-semibold">应用配置</h3>
        <StrategyRiskConfiguration
          accounts={actualAccounts}
          accountId={accountId}
          cycleMode={cycleMode}
          disabled={busy || Boolean(savedApplicationId)}
          notification={{
            enabled: notificationEnabled,
            severity: notificationSeverity,
            cooldownMinutes,
            channel: '',
            providers: notificationProviders,
          }}
          canEnableNotification={Boolean(selectedNotificationRoute)}
          routes={notificationRoutes}
          routingState={notificationRoutingState}
          onAccountChange={(value) => {
            setAccountId(value);
            setDirty(true);
          }}
          onCycleModeChange={(value) => {
            setCycleMode(value);
            setDirty(true);
          }}
          onNotificationChange={(value) => {
            setNotificationEnabled(value.enabled);
            setNotificationSeverity(value.severity);
            setCooldownMinutes(value.cooldownMinutes);
            setNotificationProviders(value.providers ?? []);
            setDirty(true);
          }}
        />
        {accounts.isPending ? <LoadingState label="正在读取账户" /> : null}
        {accounts.isError || applications.isError ? (
          <Alert variant="destructive">
            <AlertTitle>账户或风险应用读取失败</AlertTitle>
            <AlertDescription>已保存的应用无需再次提交；请先重新读取当前状态。</AlertDescription>
            <Button
              aria-busy={accounts.isFetching || applications.isFetching}
              variant="outline"
              disabled={accounts.isFetching || applications.isFetching}
              onClick={() => {
                void accounts.refetch();
                if (accountId) void applications.refetch();
              }}
            >
              {(accounts.isFetching || applications.isFetching) && (
                <Spinner data-icon="inline-start" aria-hidden="true" />
              )}
              重新读取应用状态
            </Button>
          </Alert>
        ) : null}
        {actualAccounts.length === 0 && !accounts.isPending && !accounts.isError ? (
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

        <div className="flex justify-end">
          <Button
            aria-busy={previewMutation.isPending}
            variant="outline"
            disabled={
              !selectedAccount ||
              busy ||
              accounts.isError ||
              applications.isError ||
              Boolean(savedApplicationId) ||
              sameIdentity.length > 0
            }
            onClick={() => previewMutation.mutate()}
          >
            {previewMutation.isPending && <Spinner data-icon="inline-start" aria-hidden="true" />}
            {previewMutation.isPending ? '正在预览…' : '预览风险规则'}
          </Button>
        </div>
      </section>

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
              <ListRefreshRegion
                refreshing={applications.isRefetching}
                label="正在刷新现有风险应用"
                className="flex flex-col gap-2"
              >
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
              </ListRefreshRegion>
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
        <>
          <Separator />
          <StrategyRiskPreview preview={previewData} renderRuleSettings={(rule) => (
            <StrategyRiskRuleSettings rule={rule} value={ruleDrafts[rule.sourceKey]}
              defaults={{ severity: notificationSeverity, cooldownMinutes }} disabled={busy || Boolean(savedApplicationId)}
              onChange={(value) => { setRuleDrafts((current) => ({ ...current, [rule.sourceKey]: value })); setDirty(true); }} />
          )}>
            {presentation === 'page' ? (
              <div className="flex flex-wrap justify-end gap-2">{saveActions}</div>
            ) : null}
          </StrategyRiskPreview>
        </>
      ) : null}
    </div>
  );

  if (presentation === 'drawer') {
    return (
      <Sheet
        open
        triggerId={strategyCenterTriggerId.riskApplication}
        onOpenChange={(open) => {
          if (!open && !operationBusy.current) void requestClose(false);
        }}
      >
        <SheetContent
          size="detail"
          className="overflow-hidden"
          finalFocus={() => document.getElementById(strategyCenterTriggerId.riskApplication)}
        >
          <SheetHeader>
            <SheetTitle>生成风险规则</SheetTitle>
            <SheetDescription className="pr-8">
              {source.strategy.name} v{source.version.version} ·{' '}
              {strategyInstrumentLabel(source.version.instrumentDirectory, symbol)} ·{' '}
              {strategyTimeframeLabel(parsed.data.primaryTimeframe)}
            </SheetDescription>
          </SheetHeader>
          <SheetBody>{content}</SheetBody>
          {previewData ? <SheetFooter>{saveActions}</SheetFooter> : null}
        </SheetContent>
      </Sheet>
    );
  }

  return content;
}
