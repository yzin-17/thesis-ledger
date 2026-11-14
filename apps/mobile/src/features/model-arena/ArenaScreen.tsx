import type { ResearchStackParams } from '../../app/navigation-types';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  arenaCostLabel,
  arenaRatio,
  arenaStatusLabel,
  arenaActionLabel,
} from '@thesis-ledger/domain';
import {
  MobileListRefreshRegion,
  Action,
  Copy,
  Page,
  ContentSection as Section,
  QueryStatus,
} from '../../components/MobilePrimitives';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import type { StrategyStackParams } from '../../app/strategy-navigation';

type ArenaProps = NativeStackScreenProps<StrategyStackParams, 'ModelArena'>;

function useArenaController({ route }: ArenaProps) {
  const { api, scope } = useMobileRuntime();
  const { match, round, entrant } = route.params ?? {};
  const identity = useMobileIdentity();
  const owner = identity.data?.principal?.id;
  const root = [...scope, 'arena', owner];
  const client = useQueryClient();
  const transition = useMutation({
    mutationFn: (action: 'start' | 'pause' | 'end') => api.modelArenas.transition(match!, action),
    onSettled: () => client.invalidateQueries({ queryKey: root }),
  });
  const list = useQuery({
    queryKey: [...root, 'list'],
    enabled: !!owner && !match,
    queryFn: ({ signal }) => api.modelArenas.list(signal),
  });
  const detail = useQuery({
    queryKey: [...root, match],
    enabled: !!owner && !!match,
    queryFn: ({ signal }) => api.modelArenas.get(match!, signal),
  });
  const report = useQuery({
    queryKey: [...root, match, round],
    enabled: !!owner && !!match && !!round,
    queryFn: ({ signal }) => api.modelArenas.round(match!, round!, signal),
  });
  const comparison = useQuery({
    queryKey: [...root, match, 'comparison'],
    enabled: !!owner && !!match && !round,
    queryFn: ({ signal }) => api.modelArenas.compare(match!, {}, signal),
  });
  let active: typeof list | typeof detail | typeof report = list;
  if (round) active = report;
  else if (match) active = detail;
  let refreshLabel = '正在刷新比赛列表';
  if (round) refreshLabel = '正在刷新比赛轮次';
  else if (match) refreshLabel = '正在刷新比赛详情';
  return {
    owner,
    identity,
    match,
    round,
    entrant,
    detail,
    list,
    report,
    comparison,
    transition,
    active,
    refreshLabel,
  };
}

type ArenaController = ReturnType<typeof useArenaController>;

export function ArenaScreen(props: ArenaProps) {
  const { navigation } = props;
  const {
    owner,
    identity,
    match,
    round,
    entrant,
    detail,
    list,
    report,
    comparison,
    transition,
    active,
    refreshLabel,
  } = useArenaController(props);
  return (
    <Page title={detail.data?.protocol.title ?? '模型竞技场'}>
      {!owner && (
        <>
          <QueryStatus query={identity} retry={() => void identity.refetch()} />
          {identity.isSuccess && <Copy>请先登录查看比赛。</Copy>}
        </>
      )}
      {owner && (
        <>
          {!match && (
            <Action label="新建模拟比赛" onPress={() => navigation.navigate('ArenaSetup')} />
          )}
          <QueryStatus inlineRefresh={false} query={active} retry={() => void active.refetch()} />
          <MobileListRefreshRegion
            refreshing={arenaResultsRefreshing(active, detail, comparison)}
            label={refreshLabel}
            gap={match ? 16 : 12}
          >
            {!match && list.data?.length === 0 && <Copy>暂无比赛</Copy>}
            {!match &&
              list.data?.map((m) => (
                <Action
                  key={m.id}
                  label={m.protocol.title + ' · ' + arenaStatusLabel(m.state)}
                  onPress={() => navigation.push('ModelArena', { match: m.id })}
                />
              ))}
            {match && !round && detail.data && (
              <ArenaMatchContent
                detail={detail.data}
                comparison={comparison}
                transition={transition}
                navigation={navigation}
                match={match}
              />
            )}
            {round && report.data && <ArenaRoundReport report={report.data} entrant={entrant} />}
          </MobileListRefreshRegion>
        </>
      )}
    </Page>
  );
}

function ArenaRoundReport({
  report,
  entrant,
}: {
  report: NonNullable<ArenaController['report']['data']>;
  entrant: string | undefined;
}) {
  return (
    <Section title={report.tradingDate + ' 轮次'}>
      {!report.entries.length && <Copy>该轮没有模型决策。</Copy>}
      {report.entries
        .filter((e) => !entrant || e.entrantId === entrant)
        .map((e) => (
          <Section
            key={e.entrantId}
            title={e.providerId + ' / ' + e.model + ' · ' + arenaStatusLabel(e.state)}
          >
            {e.decision?.actions.map((a) => (
              <Section key={a.symbol} title={a.symbol + ' · ' + arenaActionLabel(a)}>
                <Copy>{a.reason}</Copy>
                <Copy>失效条件 · {a.invalidatedBy}</Copy>
                {a.references.map((ref) => {
                  const f = report.facts.find((f) => f.ref === ref);
                  return (
                    f && (
                      <Copy key={ref}>
                        {f.date} · {f.symbol} ·{' '}
                        {f.kind === 'daily_bar' ? '收盘 ' + f.close : f.title}
                      </Copy>
                    )
                  );
                })}
              </Section>
            ))}
            {e.requestId && <Copy>模型费用 {arenaCostLabel(e)}</Copy>}
            {Object.entries(e.executionReasons).map(([symbol, reason]) => (
              <Copy key={symbol}>
                {symbol} · {arenaStatusLabel(reason)}
              </Copy>
            ))}
            {e.fills.map((f) => (
              <Copy key={f.symbol}>
                {f.symbol} · 模拟{f.side === 'buy' ? '买入' : '卖出'} {f.quantity} 股 × {f.price} ·
                费用 {f.fee}
              </Copy>
            ))}
          </Section>
        ))}
    </Section>
  );
}

function ArenaComparison({ comparison }: Pick<ArenaController, 'comparison'>) {
  return (
    <Section title="比赛表现">
      {comparison.data && (
        <Copy>
          {comparison.data.start} 至 {comparison.data.end} · 已开轮 {comparison.data.opened} /{' '}
          {comparison.data.planned}
        </Copy>
      )}
      {(comparison.isError || comparison.fetchStatus === 'paused') && (
        <QueryStatus
          query={comparison}
          retry={() => void comparison.refetch()}
          inlineRefresh={false}
        />
      )}
      {comparison.data?.rows.map((r) => (
        <Copy key={r.id}>
          {r.label} · 名次 {r.rank ?? '—'} · 净值 {r.metrics.endNav ?? '资料不足'} · 收益{' '}
          {arenaRatio(r.metrics.returnRatio)} · 回撤 {arenaRatio(r.metrics.drawdown)} · 换手{' '}
          {arenaRatio(r.metrics.turnover)}
        </Copy>
      ))}
    </Section>
  );
}

function ArenaMatchContent({
  detail,
  comparison,
  transition,
  navigation,
  match,
}: Pick<ArenaController, 'comparison' | 'transition'> & {
  detail: NonNullable<ArenaController['detail']['data']>;
  navigation: ArenaProps['navigation'];
  match: string;
}) {
  return (
    <>
      <Copy>
        {arenaStatusLabel(detail.state)} · 剩余 {detail.remaining.requests} 次请求
      </Copy>
      {detail.entrants.map((e) => (
        <Section key={e.id} title={e.providerId + ' / ' + e.model}>
          <Copy>
            模拟现金 {e.cash} {detail.protocol.currency} · 剩余 {e.remaining.requests} 次请求
          </Copy>
        </Section>
      ))}
      <Action
        label="模型周报"
        onPress={() =>
          navigation
            .getParent<NativeStackNavigationProp<ResearchStackParams>>()
            ?.navigate('ArenaWeek', { match })
        }
      />
      <Copy>
        模型费用总额度 {detail.protocol.budget.costMicros / 1000000}{' '}
        {detail.protocol.budgetCurrency} · 剩余 {detail.remaining.costMicros / 1000000}
      </Copy>
      {(detail.state === 'draft' || detail.state === 'paused') && (
        <Action
          label="按上述预算启动自动比赛"
          disabled={transition.isPending}
          onPress={() => transition.mutate('start')}
        />
      )}
      {detail.state === 'running' && (
        <Action
          label="暂停比赛"
          disabled={transition.isPending}
          onPress={() => transition.mutate('pause')}
        />
      )}
      {detail.state === 'paused' && (
        <Action
          label="结束本场比赛"
          disabled={transition.isPending}
          onPress={() => transition.mutate('end')}
        />
      )}
      {transition.error && <Copy>{transition.error.message}</Copy>}
      <ArenaComparison comparison={comparison} />
      {!detail.rounds.length && <Copy>暂无轮次</Copy>}
      {detail.rounds.map((r) => (
        <Action
          key={r.id}
          label={[
            r.tradingDate,
            arenaStatusLabel(r.outcome.state),
            r.outcome.state === 'unopened' ? arenaStatusLabel(r.outcome.reason) : '',
          ]
            .filter(Boolean)
            .join(' · ')}
          onPress={() => navigation.push('ModelArena', { match, round: r.id })}
        />
      ))}
    </>
  );
}

function arenaResultsRefreshing(
  active: ArenaController['active'],
  detail: ArenaController['detail'],
  comparison: ArenaController['comparison'],
) {
  return Boolean(active.data) && (active.isFetching || detail.isFetching || comparison.isFetching);
}
