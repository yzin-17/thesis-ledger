import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  arenaObservationLabel,
  arenaCostLabel,
  arenaRatio,
  arenaStatusLabel,
} from '@thesis-ledger/domain';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { useMobileIdentity } from '../../app/query/use-mobile-identity';
import type { ResearchStackParams } from '../../app/navigation-types';
import {
  MobileListRefreshRegion,
  Page,
  Section,
  Copy,
  Action,
  QueryStatus,
} from '../../components/MobilePrimitives';
export function ArenaWeekScreen({
  route,
  navigation,
}: NativeStackScreenProps<ResearchStackParams, 'ArenaWeek'>) {
  const [show, setShow] = useState(false);
  const { api, scope } = useMobileRuntime();
  const identity = useMobileIdentity(),
    owner = identity.data?.principal?.id;
  const { match, id } = route.params ?? {};
  const root = [...scope, 'model-weeklies', owner, match];
  const list = useQuery({
    queryKey: [...root, 'list'],
    enabled: !!owner && !id,
    queryFn: ({ signal }) => api.modelArenas.weeklies(match, signal),
  });
  const item = useQuery({
    queryKey: [...root, id],
    enabled: !!owner && !!match && !!id,
    queryFn: ({ signal }) => api.modelArenas.weekly(match!, id!, signal),
  });
  const query = id ? item : list,
    report = item.data?.report;
  const open = (round: string, entrant?: string) =>
    match &&
    navigation.navigate('Strategy', {
      screen: 'ModelArena',
      params: { match, round, ...(entrant && { entrant }) },
    });
  return (
    <Page title="模型周报">
      {!owner ? (
        <>
          <QueryStatus query={identity} retry={() => void identity.refetch()} />
          {identity.isSuccess && <Copy>请先登录查看周报。</Copy>}
        </>
      ) : (
        <>
          <QueryStatus inlineRefresh={false} query={query} retry={() => void query.refetch()} />
          <MobileListRefreshRegion
            refreshing={query.isRefetching && Boolean(query.data)}
            label={id ? '正在刷新周报详情' : '正在刷新周报列表'}
            gap={id ? 16 : 12}
          >
            {!id && list.data?.length === 0 && <Copy>暂无已发布的周报</Copy>}
            {!id &&
              list.data?.map((w) => (
                <Action
                  key={w.id}
                  label={w.title + ' · ' + w.week + ' 当周 · 第 ' + w.revision + ' 版'}
                  onPress={() => navigation.push('ArenaWeek', { match: w.arenaId, id: w.id })}
                />
              ))}
            {item.data && report && (
              <>
                <Section title={item.data.title + ' · ' + report.week + ' 当周'}>
                  <Copy>
                    {report.comparison.start} 至 {report.comparison.end} · 已开轮{' '}
                    {report.comparison.opened} / {report.comparison.planned}
                  </Copy>
                  {report.comparison.rows.map((r) => (
                    <Copy key={r.id}>
                      {r.label} · 收益 {arenaRatio(r.metrics.returnRatio)} · 最大回撤{' '}
                      {arenaRatio(r.metrics.drawdown)} · 期末 {r.metrics.endNav ?? '资料不足'} ·
                      交易费 {r.metrics.tradeFees ?? '资料不足'}{' '}
                      {r.kind === 'model' &&
                        ' · 决策覆盖 ' +
                          (report.comparison.opened
                            ? r.decisions + '/' + report.comparison.opened
                            : '不适用')}
                    </Copy>
                  ))}
                </Section>
                <Section title="盈亏贡献">
                  {report.attribution.map((a) => (
                    <Copy key={a.entrantId}>
                      {report.comparison.rows.find((r) => r.id === a.entrantId)?.label} ·{' '}
                      {a.symbols.map((s) => s.symbol + ' ' + s.amount).join('，')} · 费用 {a.fees} ·
                      未归属 {a.residual ?? '资料不足'}
                    </Copy>
                  ))}
                </Section>
                <Section title="同轮仓位分歧">
                  {!report.divergences.length && <Copy>本周无可比较的仓位分歧</Copy>}
                  {report.divergences.map((d) => (
                    <Action
                      key={d.roundId + d.symbol}
                      onPress={() => open(d.roundId)}
                      label={
                        d.day +
                        ' · ' +
                        d.symbol +
                        ' · 仓位相差 ' +
                        Number(d.spreadBps) / 100 +
                        ' 个百分点'
                      }
                    />
                  ))}
                </Section>
                <Action
                  label={'决策后的价格观察（' + report.observations.length + '）'}
                  onPress={() => setShow((v) => !v)}
                />
                {show &&
                  report.observations.map((o) => (
                    <Copy key={o.roundId + o.symbol + o.window}>
                      {o.day} · {o.symbol} · {o.window} 个交易日 · {arenaObservationLabel(o)}
                    </Copy>
                  ))}
                {show && report.laterNews.length > 0 && (
                  <Section title="决策后收录的标的资讯">
                    {report.laterNews.map((n) => (
                      <Copy key={n.roundId + n.ref}>
                        {n.publishedAt.slice(0, 10)} · {n.symbol} · {n.title}
                      </Copy>
                    ))}
                  </Section>
                )}
                <Section title="本周决策">
                  {report.rounds.map((r) => (
                    <Section key={r.id} title={r.day}>
                      <Action
                        label={
                          arenaStatusLabel(r.state) +
                          (r.reason ? ' · ' + arenaStatusLabel(r.reason) : '')
                        }
                        onPress={() => open(r.id)}
                      />
                      {r.entries.map((e) => (
                        <Action
                          key={e.entrantId}
                          label={
                            e.model +
                            ' · ' +
                            arenaStatusLabel(e.state) +
                            ' · 模型费用 ' +
                            arenaCostLabel(e)
                          }
                          onPress={() => open(r.id, e.entrantId)}
                        />
                      ))}
                    </Section>
                  ))}
                </Section>
                <Section title="本周模拟成交">
                  {!report.fills.length && <Copy>本周无模拟成交</Copy>}
                  {report.fills.map((f) => (
                    <Action
                      key={f.id}
                      label={
                        f.symbol +
                        ' · 模拟' +
                        (f.side === 'buy' ? '买入' : '卖出') +
                        ' ' +
                        f.quantity +
                        ' 股 × ' +
                        f.price
                      }
                      onPress={() => open(f.roundId, f.entrantId)}
                    />
                  ))}
                </Section>
              </>
            )}
          </MobileListRefreshRegion>
        </>
      )}
    </Page>
  );
}
