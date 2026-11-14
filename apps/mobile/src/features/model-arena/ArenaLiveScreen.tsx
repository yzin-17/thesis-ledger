import { useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  arenaLiveLabel,
  arenaNextDecisionLabel,
  arenaRatio,
  arenaSeasonLabel,
  arenaBudgetCostLabel,
  formatDecimalNumber,
  arenaTimelineLabel,
  arenaTimelineReason,
} from '@thesis-ledger/domain';
import type { ArenaStackParams } from '../../app/ArenaNavigator';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import {
  Page,
  ContentSection as Section,
  Copy,
  Action,
  Choices,
  QueryStatus,
  MobileListRefreshRegion,
  failureMessage,
} from '../../components/MobilePrimitives';
import { ArenaLiveChart } from './ArenaLiveChart';
import { ArenaLiveAccount } from './ArenaLiveAccount';
type Props = NativeStackScreenProps<ArenaStackParams, 'ArenaHome' | 'ArenaMatch'>;
function useArenaLiveController({ route }: Props) {
  const { api, baseUrl } = useMobileRuntime(),
    identity = useMobileIdentity(),
    focused = useIsFocused(),
    cache = useQueryClient();
  const owner = identity.data?.principal?.id,
    match = route.params?.match;
  const requested = route.params?.entrant ?? '';
  const root = ['mobile-arena', baseUrl, owner],
    [selection, setSelection] = useState({ match, requested, id: requested });
  const selected =
    selection.match === match && selection.requested === requested ? selection.id : requested;
  const setSelected = (id: string) => setSelection({ match, requested, id });
  const list = useQuery({
    queryKey: [...root, 'list'],
    enabled: !!owner && !match,
    queryFn: ({ signal }) => api.arenaMatches.list(signal),
  });
  const query = useQuery({
    queryKey: [...root, match],
    enabled: !!owner && !!match,
    queryFn: ({ signal }) => api.arenaMatches.get(match!, signal),
    refetchInterval: (q) => (focused && q.state.data?.state === 'running' ? 15000 : false),
  });
  const transition = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'end') => api.arenaMatches.transition(match!, action),
    onSettled: () => cache.invalidateQueries({ queryKey: root }),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.arenaMatches.retry(match!, id),
    onSettled: () => cache.invalidateQueries({ queryKey: root }),
  });
  const trigger = useMutation({
    mutationFn: (id: string) => api.arenaMatches.trigger(match!, id),
    onSettled: () => cache.invalidateQueries({ queryKey: root }),
  });
  const replayRetry = useMutation({
    mutationFn: () => api.arenaMatches.retryReplay(match!),
    onSettled: () => cache.invalidateQueries({ queryKey: root }),
  });
  const d = query.data,
    active = match ? query : list;
  const current = d?.agents.some((a) => a.id === selected) ? selected : (d?.agents[0]?.id ?? '');
  return {
    owner,
    identity,
    match,
    list,
    d,
    active,
    transition,
    retry,
    trigger,
    replayRetry,
    current,
    setSelected,
  };
}

type ArenaLiveController = ReturnType<typeof useArenaLiveController>;
type ArenaDetail = NonNullable<ArenaLiveController['d']>;

export function ArenaLiveScreen(props: Props) {
  const { navigation } = props;
  const {
    owner,
    identity,
    match,
    list,
    d,
    active,
    transition,
    retry,
    trigger,
    replayRetry,
    current,
    setSelected,
  } = useArenaLiveController(props);
  return (
    <Page title={d?.protocol.title ?? '模型竞技场'}>
      {!owner && (
        <>
          <QueryStatus query={identity} retry={() => void identity.refetch()} />
          {identity.isSuccess && <Copy>请先登录查看比赛。</Copy>}
        </>
      )}
      {owner && (
        <>
          <QueryStatus query={active} retry={() => void active.refetch()} inlineRefresh={false} />
          {!match && (
            <>
              <Action
                label="新建模拟比赛"
                primary
                onPress={() => navigation.navigate('ArenaCreate')}
              />
              <Action label="历史比赛" onPress={() => navigation.navigate('ModelArena')} />
            </>
          )}
          <Action label="刷新" disabled={active.isFetching} onPress={() => void active.refetch()} />
          <MobileListRefreshRegion
            refreshing={Boolean(active.data) && active.isFetching}
            label="正在刷新比赛"
            gap={16}
          >
            {!match && list.data?.length === 0 && (
              <Copy muted>创建一场比赛，让不同模型独立管理模拟账户并比较收益。</Copy>
            )}
            {!match &&
              list.data?.map((m) => (
                <Action
                  key={m.id}
                  label={m.protocol.title + ' · ' + arenaLiveLabel(m.state)}
                  onPress={() => navigation.navigate('ArenaMatch', { match: m.id })}
                />
              ))}
            {d && (
              <>
                <Copy>
                  {arenaLiveLabel(d.state)} · {arenaSeasonLabel(d.protocol)}
                </Copy>
                <Copy muted>
                  每模型模拟本金 {formatDecimalNumber(d.protocol.initialCash)} {d.protocol.currency}{' '}
                  · 剩余模型费用{' '}
                  {arenaBudgetCostLabel(d.remaining.costMicros, d.protocol.budgetCurrency)}
                </Copy>
                <ArenaLifecycle
                  d={d}
                  transition={transition}
                  retry={retry}
                  replayRetry={replayRetry}
                />
                <ArenaLiveChart detail={d} />
                <ArenaRanking d={d} current={current} setSelected={setSelected} />
                <Choices
                  label="模型账户"
                  value={current}
                  options={d.agents.map((a) => ({ value: a.id, label: a.model }))}
                  onChange={setSelected}
                />
                <ArenaLiveAccount
                  detail={d}
                  agentId={current}
                  onRetry={() => retry.mutate(current)}
                  busy={retry.isPending}
                  onTrigger={() => trigger.mutate(current)}
                  triggerBusy={trigger.isPending}
                  triggerError={trigger.variables === current ? trigger.error : null}
                  triggerAppointment={trigger.data?.id === current ? trigger.data.appointment : null}
                />
              </>
            )}
          </MobileListRefreshRegion>
        </>
      )}
    </Page>
  );
}

function ArenaRanking({
  d,
  current,
  setSelected,
}: Pick<ArenaLiveController, 'current' | 'setSelected'> & { d: ArenaDetail }) {
  const latest = d.state === 'ended' ? d.sealedFrame : d.frames.at(-1);
  return (
    <Section title="赛季排名">
      {latest && !latest.complete && <Copy muted>共同估值不完整，本批次暂停排名。</Copy>}
      {[...d.agents]
        .sort(
          (a, b) =>
            (latest?.marks.find((m) => m.agentId === a.id)?.rank ?? 999) -
            (latest?.marks.find((m) => m.agentId === b.id)?.rank ?? 999),
        )
        .map((a) => {
          const m = latest?.marks.find((s) => s.agentId === a.id);
          return (
            <Section key={a.id} title={(m?.rank ?? '—') + ' · ' + a.model}>
              <Action
                label={a.providerId + ' / ' + a.model + ' · ' + arenaLiveLabel(a.state)}
                primary={a.id === current}
                onPress={() => setSelected(a.id)}
              />
              <Copy>
                净值 {m?.nav ? formatDecimalNumber(m.nav) : '未估值'} · 赛季收益{' '}
                {arenaRatio(m?.returnRatio ?? null)} · 最大回撤 {arenaRatio(m?.drawdown ?? null)}
              </Copy>
              <Copy muted>下一次决策：{arenaNextDecisionLabel({
                wakeups: a.account.wakeups, matchState: d.state, agentState: a.state,
                timeZone: d.protocol.timeZone, pending: a.cycles.some((c) => c.state === 'pending'),
                ...(d.timeline?.phase === 'replay' ? { clockAt: d.timeline.pendingAt ?? d.timeline.cursorAt } : {}),
              })}</Copy>
            </Section>
          );
        })}
    </Section>
  );
}

function ArenaLifecycle({
  d,
  transition,
  retry,
  replayRetry,
}: Pick<ArenaLiveController, 'transition' | 'retry' | 'replayRetry'> & { d: ArenaDetail }) {
  return (
    <>
      {(d.state === 'draft' || d.state === 'paused') && (
        <Action
          primary
          label={d.state === 'draft' ? '启动比赛' : '恢复比赛'}
          disabled={transition.isPending}
          onPress={() => transition.mutate('start')}
        />
      )}
      {d.state === 'running' && (
        <Action
          label="暂停比赛"
          disabled={transition.isPending}
          onPress={() => transition.mutate('pause')}
        />
      )}
      {d.state === 'paused' && (
        <Copy muted>研究与成交已暂停，委托保留。恢复后将为可继续研究的模型预约一次决策；盘前也能研究，但交易仅在开市后执行。</Copy>
      )}
      {(d.state === 'running' || d.state === 'paused') && (
        <Action
          label="结束并封存"
          disabled={transition.isPending}
          onPress={() => transition.mutate('end')}
        />
      )}
      {d.state === 'ended' && (
        <Copy muted>
          {d.sealedFrame
            ? '最终共同估值时间：' +
              new Date(d.sealedFrame.at).toLocaleString('zh-CN', { timeZone: d.protocol.timeZone })
            : '尚无完整共同估值，无法确定最终排名。'}{' '}
          持仓已保留，剩余委托已撤销。
        </Copy>
      )}
      {(transition.error || retry.error || replayRetry.error) && (
        <Copy>{failureMessage(transition.error ?? retry.error ?? replayRetry.error)}</Copy>
      )}
      {d.timeline && (
        <Section title={arenaTimelineLabel(d.timeline)}>
          <Copy>
            已推进至{' '}
            {new Date(d.timeline.pendingAt ?? d.timeline.cursorAt).toLocaleString('zh-CN', {
              timeZone: d.protocol.timeZone,
            })}
          </Copy>
          {d.timeline.reason && <Copy muted>{arenaTimelineReason(d.timeline.reason)}</Copy>}
          {d.state === 'running' && d.timeline.status === 'blocked' && (
            <Action
              label="重试回放"
              disabled={replayRetry.isPending}
              onPress={() => replayRetry.mutate()}
            />
          )}
        </Section>
      )}
    </>
  );
}
