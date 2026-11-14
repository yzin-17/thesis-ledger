import { ArenaDisclosure } from './ArenaDisclosure.js';
import { ArenaSections } from './ArenaSections.js';
import { Separator } from '@/components/ui/separator';
import { useRef, useSyncExternalStore } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Route,
  Routes,
  useParams,
  Navigate,
  useLocation,
  useSearchParams,
  Outlet,
} from 'react-router';
import {
  arenaLiveLabel,
  arenaBudgetCountLabel,
  arenaBudgetCostLabel,
  arenaTimelineReason,
} from '@thesis-ledger/domain';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ArenaDetailHeader, ArenaFacts, ArenaModelName } from './ArenaDetailShell.js';
import { ArenaLiveOverview } from './ArenaLiveOverview.js';
import { ArenaLivePerformance } from './ArenaLivePerformance.js';
import { LoadingState } from '@/components/ui/spinner';
import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { ArenaLiveSetup } from './ArenaLiveSetup.js';
import { ArenaLiveList } from './ArenaLiveList.js';
import { ArenaLiveAgent } from './ArenaLiveAgent.js';
import { ArenaPage } from './ArenaPage.js';
import { arenaCatalogReturn } from './arena-catalog-navigation.js';
import { ArenaLiveDecisions } from './ArenaLiveDecisions.js';

export function ArenaLivePage() {
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
  );
  const scope = ['desktop', window.location.origin, owner, 'arena-live'];
  const location = useLocation();
  return (
    <section className="module-page min-w-0">
      <Routes>
        <Route index element={<ArenaLiveList scope={scope} />} />
        <Route
          path="history"
          element={
            <Navigate
              replace
              to={{ pathname: '/arena', search: location.search, hash: location.hash }}
              state={location.state as unknown}
            />
          }
        />
        <Route element={<ArenaLiveContent />}>
          <Route path="new" element={<ArenaLiveSetup key={owner} scope={scope} />} />
          <Route
            path="history/:match/:round?"
            element={<ArenaPage basePath="/arena/history" listPath="/arena" />}
          />
          <Route path=":match" element={<ArenaLiveMatch key={owner} scope={scope} />} />
        </Route>
      </Routes>
    </section>
  );
}
function ArenaLiveContent() {
  return <Outlet />;
}
function ArenaLiveMatch(props: { scope: string[] }) {
  const control = useArenaLiveMatch(props);
  const {
    d,
    transition,
    query,
    retry,
    replayRetry,
    tab,
    setTab,
    accountsTab,
    decisionsTab,
    openAccount,
    openDecision,
    agentId,
    setSelected,
    trigger,
  } = control;

  return (
    <div className="grid min-w-0 gap-group">
      <LiveMatchHeader control={control} />
      {query.isPending && <LoadingState label="正在读取比赛" />}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          比赛读取失败，请刷新重试。
        </p>
      )}
      <ListRefreshRegion
        refreshing={Boolean(d) && query.isFetching}
        label="正在刷新比赛"
        className="grid min-w-0 gap-group"
      >
        {d && (
          <>
            {(d.state === 'draft' || d.state === 'paused') && (
              <p className="text-xs text-muted-foreground">
                {d.state === 'draft' ? '启动' : '恢复'}
                后会调用模型并产生费用，完整额度见「比赛设置」。
              </p>
            )}
            {(transition.error || retry.error || replayRetry.error) && (
              <p role="alert" className="text-sm text-destructive">
                {transition.error?.message ?? retry.error?.message ?? replayRetry.error?.message}
              </p>
            )}
            {d.state === 'running' && d.timeline?.status === 'blocked' && (
              <div
                role="status"
                className="flex flex-wrap items-center justify-between gap-3 text-sm"
              >
                <span>
                  回放遇到阻塞：
                  {d.timeline.reason ? arenaTimelineReason(d.timeline.reason) : '等待重试。'}
                </span>
                <Button
                  variant="outline"
                  disabled={replayRetry.isPending}
                  onClick={() => replayRetry.mutate()}
                >
                  重试回放
                </Button>
              </div>
            )}
            <Tabs key={d.id} value={tab} onValueChange={setTab} className="min-w-0">
              <TabsList variant="line" aria-label="比赛详情">
                <TabsTrigger value="performance">收益表现</TabsTrigger>
                <TabsTrigger ref={accountsTab} value="accounts">
                  模型账户
                </TabsTrigger>
                <TabsTrigger ref={decisionsTab} value="decisions">
                  历史决策
                </TabsTrigger>
                <TabsTrigger value="settings">比赛设置</TabsTrigger>
              </TabsList>
              <TabsContent value="performance" keepMounted className="min-w-0">
                <ArenaLivePerformance
                  detail={d}
                  onSelect={openAccount}
                  onOpenDecision={openDecision}
                />
              </TabsContent>
              {(['accounts', 'decisions'] as const).map((view) => (
                <TabsContent key={view} value={view} className="grid min-w-0 gap-5">
                  <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                    {d.agents.map((a) => (
                      <Button
                        key={a.id}
                        variant={agentId === a.id ? 'secondary' : 'ghost'}
                        aria-pressed={agentId === a.id}
                        className="h-auto min-w-0 justify-start p-3 text-left whitespace-normal"
                        onClick={() => setSelected(a.id)}
                      >
                        <ArenaModelName model={a.model} provider={a.providerId} />
                      </Button>
                    ))}
                  </div>
                  <Separator />
                  {view === 'accounts' ? (
                    <ArenaLiveAgent
                      detail={d}
                      agentId={agentId}
                      onRetry={() => retry.mutate(agentId)}
                      busy={retry.isPending}
                      onTrigger={() => trigger.mutate(agentId)}
                      triggerBusy={trigger.isPending}
                      triggerAppointment={
                        trigger.data?.id === agentId ? trigger.data.appointment : null
                      }
                      triggerError={trigger.variables === agentId ? trigger.error : null}
                      onHistory={() => setSelected(agentId, 'decisions')}
                    />
                  ) : (
                    <ArenaLiveDecisions detail={d} agentId={agentId} />
                  )}
                </TabsContent>
              ))}
              <LiveMatchSettings control={control} d={d} />
            </Tabs>
          </>
        )}
      </ListRefreshRegion>
    </div>
  );
}
export function LegacyArenaRedirect() {
  const location = useLocation(),
    suffix = location.pathname.slice('/strategy/arena'.length);
  let path = '/arena/history' + suffix;
  if (!suffix || suffix === '/') path = '/arena';
  else if (suffix === '/new') path = '/arena/new';
  return (
    <Navigate
      replace
      to={{ pathname: path, search: location.search, hash: location.hash }}
      state={location.state as unknown}
    />
  );
}

function useArenaLiveMatch({ scope }: { scope: string[] }) {
  const { match = '' } = useParams(),
    api = getDesktopApiClient().arenaMatches,
    cache = useQueryClient();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const requested = location.hash.startsWith('#model-') ? location.hash.slice(7) : '';
  const view = params.get('view');
  let tab = requested ? 'accounts' : 'performance';
  if (view && ['performance', 'accounts', 'decisions', 'settings'].includes(view)) tab = view;
  const setTab = (value: string) =>
    setParams(
      (current) => {
        current.set('view', value);
        return current;
      },
      { state: location.state as unknown },
    );
  const accountsTab = useRef<HTMLButtonElement>(null);
  const decisionsTab = useRef<HTMLButtonElement>(null);
  const selected = params.get('model') ?? requested;
  const setSelected = (id: string, view = tab) =>
    setParams(
      (current) => {
        current.set('view', view);
        current.set('model', id);
        current.delete('decisionPage');
        return current;
      },
      { state: location.state as unknown },
    );
  const openAccount = (id: string) => {
    setSelected(id, 'accounts');
    accountsTab.current?.focus();
  };
  const openDecision = (id: string) => {
    setSelected(id, 'decisions');
    decisionsTab.current?.focus();
  };
  const query = useQuery({
    queryKey: [...scope, match],
    queryFn: ({ signal }) => api.get(match, signal),
    refetchInterval: (q) => (q.state.data?.state === 'running' ? 15000 : false),
  });
  const transition = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'end') => api.transition(match, action),
    onSettled: () => cache.invalidateQueries({ queryKey: scope }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.retry(match, id),
    onSettled: () => cache.invalidateQueries({ queryKey: scope }),
  });
  const trigger = useMutation({
    mutationFn: (id: string) => api.trigger(match, id),
    onSettled: () => cache.invalidateQueries({ queryKey: scope }),
  });
  const replayRetry = useMutation({
    mutationFn: () => api.retryReplay(match),
    onSettled: () => cache.invalidateQueries({ queryKey: scope }),
  });
  const d = query.data,
    agentId = d?.agents.some((a) => a.id === selected) ? selected : (d?.agents[0]?.id ?? '');

  return {
    d,
    location,
    transition,
    query,
    retry,
    replayRetry,
    tab,
    setTab,
    accountsTab,
    decisionsTab,
    openAccount,
    openDecision,
    agentId,
    setSelected,
    trigger,
  };
}

function LiveMatchHeader({ control }: { control: ReturnType<typeof useArenaLiveMatch> }) {
  return (
    <>
      <ArenaDetailHeader
        title={control.d?.protocol.title ?? '比赛详情'}
        backPath={arenaCatalogReturn(control.location.state)}
        titleAccessory={
          control.d ? (
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
              {arenaLiveLabel(control.d.state)}
            </span>
          ) : null
        }
        actions={
          <>
            {control.d && (
              <>
                {(control.d.state === 'draft' || control.d.state === 'paused') && (
                  <Button
                    disabled={control.transition.isPending}
                    onClick={() => control.transition.mutate('start')}
                  >
                    {control.d.state === 'draft' ? '启动比赛' : '恢复比赛'}
                  </Button>
                )}
                {control.d.state === 'running' && (
                  <Button
                    variant="outline"
                    disabled={control.transition.isPending}
                    onClick={() => control.transition.mutate('pause')}
                  >
                    暂停比赛
                  </Button>
                )}
                {(control.d.state === 'running' || control.d.state === 'paused') && (
                  <Button
                    variant="outline"
                    disabled={control.transition.isPending}
                    onClick={() => control.transition.mutate('end')}
                  >
                    结束比赛
                  </Button>
                )}
              </>
            )}
            <RefreshIconButton
              label="刷新比赛"
              refreshing={control.query.isFetching}
              onClick={() => void control.query.refetch()}
            />
          </>
        }
      />
    </>
  );
}
function LiveMatchSettings({
  d,
}: {
  control: ReturnType<typeof useArenaLiveMatch>;
  d: NonNullable<ReturnType<typeof useArenaLiveMatch>['d']>;
}) {
  return (
    <>
      <TabsContent value="settings">
        <ArenaSections>
          <ArenaLiveOverview detail={d} />
          <section className="grid gap-5">
            <h2 className="text-xl font-semibold">模型调用额度</h2>
            <ArenaFacts
              items={[
                ['总请求额度', arenaBudgetCountLabel(d.protocol.budget.requests, ' 次')],
                ['剩余请求', arenaBudgetCountLabel(d.remaining.requests, ' 次')],
                ['令牌总额度', arenaBudgetCountLabel(d.protocol.budget.tokens)],
                ['剩余令牌', arenaBudgetCountLabel(d.remaining.tokens)],
                [
                  '模型费用总额度',
                  arenaBudgetCostLabel(d.protocol.budget.costMicros, d.protocol.budgetCurrency),
                ],
                [
                  '剩余模型费用',
                  arenaBudgetCostLabel(d.remaining.costMicros, d.protocol.budgetCurrency),
                ],
                ['网页搜索', d.protocol.allowWebSearch ? '开启' : '关闭'],
                ['选股范围', d.protocol.universe === 'fixed' ? '固定标的池' : '全市场自主选股'],
                [
                  '单次研究步骤',
                  d.protocol.resources.maxResearchSteps === null
                    ? '不限制'
                    : arenaBudgetCountLabel(d.protocol.resources.maxResearchSteps),
                ],
                [
                  '单次研究时限',
                  d.protocol.resources.maxCycleSeconds === null
                    ? '不限制'
                    : arenaBudgetCountLabel(d.protocol.resources.maxCycleSeconds, ' 秒'),
                ],
              ]}
            />
          </section>
          <ArenaDisclosure title="查看完整冻结协议">
            <pre className="mt-4 max-h-96 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">
              {JSON.stringify(d.protocol, null, 2)}
            </pre>
          </ArenaDisclosure>
        </ArenaSections>
      </TabsContent>
    </>
  );
}
