import { ListRefreshRegion } from '@/components/ui/list-refresh-region';
import { LoadingState } from '@/components/ui/spinner';
import { useEffect, useSyncExternalStore } from 'react';
import { ArenaSetup } from './ArenaSetup.js';
import { Button } from '@/components/ui/button';
import { ArenaDetailHeader } from './ArenaDetailShell.js';
import { ArenaDailyMatch } from './ArenaDailyMatch.js';
import { ArenaDailyActivity } from './ArenaDailyActivity.js';
import {
  readArenaDailyNavigation,
  updateArenaDailyNavigation,
  arenaDailyLegacyTarget,
  type ArenaDailyView,
} from './arena-daily-navigation.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router';
import { arenaStatusLabel } from '@thesis-ledger/domain';
import { getDesktopApiClient } from '../../shared/api/client.js';
import {
  currentIdentitySession,
  subscribeIdentitySession,
} from '../../shared/api/identity-session.js';

export function ArenaPage(props: { basePath?: string; listPath?: string }) {
  const control = useArenaPage(props);
  const { selected, transition, active, match, basePath, owner, legacyRound, location } = control;
  if (match === 'new') return <ArenaSetup key={owner} owner={owner} />;
  if (legacyRound && match)
    return (
      <Navigate
        replace
        to={arenaDailyLegacyTarget(
          basePath + '/' + match,
          location.search,
          legacyRound,
          location.hash,
        )}
        state={location.state as unknown}
      />
    );
  return (
    <section className="grid min-w-0 gap-group">
      <DailyMatchHeader control={control} />
      {selected && (selected.state === 'draft' || selected.state === 'paused') && (
        <p className="text-xs text-muted-foreground">
          启动后会调用模型并消耗设定额度。剩余 {selected.remaining.requests} 次请求、
          {selected.remaining.costMicros / 1000000} {selected.protocol.budgetCurrency}
          ；完整预算见比赛设置。
        </p>
      )}
      {transition.error && (
        <p role="alert" className="text-sm text-destructive">
          {transition.error.message}
        </p>
      )}
      {active.isError && (
        <Button variant="outline" className="w-fit" onClick={() => void active.refetch()}>
          读取失败，重新读取
        </Button>
      )}
      {active.isPending && <LoadingState label="正在读取比赛" />}
      <DailyMatchContent control={control} />
    </section>
  );
}

function useArenaPage({
  basePath = '/strategy/arena',
  listPath = basePath,
}: {
  basePath?: string;
  listPath?: string;
}) {
  const location = useLocation();
  const { origin } = arenaPageOrigin(location.state);
  const { match, round: legacyRound } = useParams();
  const [params, setParams] = useSearchParams();
  const navigation = readArenaDailyNavigation(params);
  const activity = navigation.view === 'activity';
  const changeNavigation = (changes: Parameters<typeof updateArenaDailyNavigation>[1]) =>
    setParams((current) => updateArenaDailyNavigation(current, changes), {
      state: location.state as unknown,
    });
  const changeView = (view: ArenaDailyView) => changeNavigation({ view });
  const api = getDesktopApiClient().modelArenas;
  const owner = useSyncExternalStore(
    subscribeIdentitySession,
    () => currentIdentitySession()?.principal.id ?? 'local-workspace',
  );
  const client = useQueryClient();
  const scope = ['desktop', window.location.origin, owner, 'model-arenas'];
  const { list, detail, roundId, invalid, report, comparison } = useArenaReadQueries(
    scope,
    match,
    legacyRound,
    activity,
    navigation,
    api,
  );
  const transition = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'end') => api.transition(match!, action),
    onSettled: () => client.invalidateQueries({ queryKey: scope }),
  });
  const latestRoundId = detail.data?.rounds[0]?.id;
  useEffect(() => {
    if (!legacyRound && activity && !params.has('round') && latestRoundId)
      setParams((current) => updateArenaDailyNavigation(current, { roundId: latestRoundId }), {
        replace: true,
        state: location.state as unknown,
      });
  }, [legacyRound, activity, params, latestRoundId, setParams, location.state]);

  const selected = detail.data;

  const active = match ? detail : list;
  const comparisonFetching = !activity && comparison.isFetching;
  const fetching = active.isFetching || comparisonFetching || (activity && report.isFetching);
  const refreshing =
    Boolean(active.data) &&
    (active.isFetching ||
      comparisonFetching ||
      (activity && report.isFetching && Boolean(report.data)));
  let refreshLabel = '正在刷新比赛列表';
  if (match) refreshLabel = activity ? '正在刷新决策与成交' : '正在刷新比赛详情';
  const catalogOrigin = origin === '/arena' || Boolean(origin?.startsWith('/arena?'));
  const backPath = origin ?? listPath;
  const clearRecords = () => changeNavigation({ view: 'activity', roundId: null, modelId: null });
  const openLatest = (modelId: string) =>
    changeNavigation({ view: 'activity', roundId: selected?.rounds[0]?.id ?? null, modelId });

  return {
    selected,
    backPath,
    origin,
    catalogOrigin,
    transition,
    fetching,
    active,
    match,
    activity,
    comparison,
    roundId,
    invalid,
    report,
    refreshing,
    refreshLabel,
    list,
    basePath,
    navigation,
    changeView,
    openLatest,
    changeNavigation,
    clearRecords,
    owner,
    legacyRound,
    location,
  };
}

function DailyMatchHeader({ control }: { control: ReturnType<typeof useArenaPage> }) {
  return (
    <>
      <ArenaDetailHeader
        title={control.selected?.protocol.title ?? '模型竞技场'}
        backPath={control.backPath}
        backLabel={control.origin && !control.catalogOrigin ? '返回来源页' : '返回比赛列表'}
        backState={control.catalogOrigin ? { arenaReturn: control.origin } : undefined}
        actions={
          <>
            {control.selected && (
              <>
                {(control.selected.state === 'draft' || control.selected.state === 'paused') && (
                  <Button
                    disabled={control.transition.isPending}
                    onClick={() => control.transition.mutate('start')}
                  >
                    {control.selected.state === 'draft' ? '启动比赛' : '恢复比赛'}
                  </Button>
                )}
                {control.selected.state === 'running' && (
                  <Button
                    variant="outline"
                    disabled={control.transition.isPending}
                    onClick={() => control.transition.mutate('pause')}
                  >
                    暂停比赛
                  </Button>
                )}
                {control.selected.state === 'paused' && (
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
              label="刷新比赛详情"
              refreshing={control.fetching}
              onClick={() => {
                void control.active.refetch();
                if (control.match && !control.activity) void control.comparison.refetch();
                if (control.activity && control.roundId && !control.invalid)
                  void control.report.refetch();
              }}
            />
          </>
        }
      >
        {control.selected && (
          <>
            <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
              {arenaStatusLabel(control.selected.state)}
            </span>
            <span>
              日频比赛 · {{ CN: 'A股', HK: '港股', US: '美股' }[control.selected.protocol.market]}
            </span>
            <span>
              {control.selected.protocol.startsOn + ' 至 ' + control.selected.protocol.endsOn}
            </span>
          </>
        )}
      </ArenaDetailHeader>
    </>
  );
}

function arenaPageOrigin(historyState: unknown) {
  let origin: string | undefined;
  if (
    historyState &&
    typeof historyState === 'object' &&
    'arenaReturn' in historyState &&
    typeof historyState.arenaReturn === 'string' &&
    /^\/(?!\/)/.test(historyState.arenaReturn) &&
    !historyState.arenaReturn.includes('\\')
  )
    origin = historyState.arenaReturn;
  return { origin };
}

function useArenaReadQueries(
  scope: string[],
  match: string | undefined,
  legacyRound: string | undefined,
  activity: boolean,
  navigation: ReturnType<typeof readArenaDailyNavigation>,
  api: ReturnType<typeof getDesktopApiClient>['modelArenas'],
) {
  const list = useQuery({
    queryKey: [...scope, 'list'],
    queryFn: ({ signal }) => api.list(signal),
    enabled: !match,
  });
  const detail = useQuery({
    queryKey: [...scope, match],
    queryFn: ({ signal }) => api.get(match!, signal),
    enabled: !!match && match !== 'new' && !legacyRound,
  });
  const roundId = navigation.invalidRound
    ? null
    : (navigation.roundId ?? detail.data?.rounds[0]?.id ?? null);
  const invalid = navigation.invalidRound || navigation.invalidModel;
  const report = useQuery({
    queryKey: [...scope, match, 'round', roundId],
    queryFn: ({ signal }) => api.round(match!, roundId!, signal),
    enabled: !!match && !legacyRound && activity && !!roundId && !invalid,
  });
  const comparison = useQuery({
    queryKey: [...scope, match, 'comparison'],
    enabled: !!match && match !== 'new' && !legacyRound && !activity,
    queryFn: ({ signal }) => api.compare(match!, {}, signal),
  });
  return { list, detail, roundId, invalid, report, comparison };
}
function DailyMatchContent({ control }: { control: ReturnType<typeof useArenaPage> }) {
  return (
    <>
      <ListRefreshRegion
        refreshing={control.refreshing}
        label={control.refreshLabel}
        className="grid min-w-0 min-h-8 gap-group"
      >
        {!control.match && control.list.data?.length === 0 && <p>暂无比赛</p>}
        {!control.match &&
          control.list.data?.map((m) => (
            <Link key={m.id} to={control.basePath + '/' + m.id}>
              {m.protocol.title} · {arenaStatusLabel(m.state)} · {m.protocol.startsOn} 至{' '}
              {m.protocol.endsOn}
            </Link>
          ))}
        {control.match && control.selected && (
          <ArenaDailyMatch
            detail={control.selected}
            comparison={control.comparison.data}
            comparisonError={control.comparison.isError}
            retryComparison={() => void control.comparison.refetch()}
            view={control.navigation.view}
            onViewChange={control.changeView}
            onOpenLatest={control.openLatest}
            activity={
              <ArenaDailyActivity
                detail={control.selected}
                roundId={control.roundId}
                modelId={control.navigation.modelId}
                report={control.report.data}
                loading={control.report.isPending && !control.refreshing}
                error={control.report.isError}
                invalid={control.invalid}
                onRoundChange={(id) => control.changeNavigation({ view: 'activity', roundId: id })}
                onModelChange={(id) => control.changeNavigation({ modelId: id })}
                onClear={control.clearRecords}
                onRetry={() => void control.report.refetch()}
              />
            }
          />
        )}
      </ListRefreshRegion>
    </>
  );
}
