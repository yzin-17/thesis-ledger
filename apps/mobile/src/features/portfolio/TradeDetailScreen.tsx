import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useMobileRuntime } from '../../app/MobileRuntime';
import {
  Copy,
  Action,
  Feedback,
  Page,
  QueryStatus,
  Section,
} from '../../components/MobilePrimitives';
import type { PortfolioStackParams, RootTabParams } from '../../app/navigation-types';
import { OpeningBoundaryForm } from './OpeningBoundaryForm';
import { tradeAlgorithmLabel, tradeIssueLabels } from './trade-display';
export function TradeDetailScreen() {
  const { params } = useRoute<RouteProp<PortfolioStackParams, 'TradeDetail'>>();
  const navigation = useNavigation();
  const { api, scope, mode } = useMobileRuntime();
  const [sliceId, setSliceId] = useState<string | null>(params.closeSliceId ?? null);
  const query = useQuery({
    queryKey: [...scope, 'trade', params.accountId, params.tradeId],
    enabled: Boolean(params.tradeId) && mode === params.mode,
    queryFn: async () => {
      const trade = await api.portfolio.getTrade(params.accountId, params.tradeId!, mode);
      if (trade.accountId !== params.accountId || trade.accountMode !== mode)
        throw new Error('交易不属于当前账户范围。');
      return trade;
    },
  });
  const trade = query.data;
  const review = () =>
    navigation.getParent<BottomTabNavigationProp<RootTabParams>>()?.navigate('Research', {
      accountId: params.accountId,
      mode,
      tradeId: params.tradeId!,
      ...(sliceId ? { closeSliceId: sliceId } : {}),
    });
  return (
    <Page title="交易详情">
      {mode !== params.mode ? (
        <Feedback message="交易所属范围与当前实际/模拟范围不同，请切换后重新打开。" error />
      ) : (
        <QueryStatus query={query} retry={() => void query.refetch()} />
      )}
      {trade ? (
        <>
          <Section title={trade.assetName ?? trade.symbol}>
            <Copy>
              {trade.symbol} · 剩余 {trade.remainingQuantity} · 已平仓 {trade.closedQuantity}
            </Copy>
            <Copy>
              已实现毛盈亏 {trade.grossRealizedPnl ?? '不可用'} · 净盈亏{' '}
              {trade.netRealizedPnl ?? '不可用'}
            </Copy>
            <Copy muted>
              建仓 {trade.openedAt ?? '未知'} · 结束 {trade.closedAt ?? '未结束'} · 算法{' '}
              {tradeAlgorithmLabel(trade.algorithmVersion)}
            </Copy>
            <Feedback message={tradeIssueLabels(trade).join('；')} />
          </Section>
          <Section title="成交与成本来源">
            {trade.entryLegs.map((leg) => (
              <Section key={leg.id}>
                <Copy>
                  {leg.occurredAt ?? '时间未知'} · 数量 {leg.quantity} · 价格 {leg.price}{' '}
                  {leg.currency}
                </Copy>
                <Copy>
                  剩余数量 {leg.remainingQuantity} · 剩余成本 {leg.remainingCost ?? '未知'}
                </Copy>
                {leg.charges.map((charge, index) => (
                  <Copy key={index}>
                    费用 {charge.amount} {charge.currency}
                  </Copy>
                ))}
              </Section>
            ))}
            {trade.baselineComponents.map((base) => (
              <Section key={base.id}>
                <Copy>
                  持仓快照 · {base.occurredAt ?? '时间未知'} · 数量 {base.quantity}
                </Copy>
                <Copy>
                  成本 {base.averageCost ?? '未知'} {base.currency} · 剩余成本{' '}
                  {base.remainingCost ?? '未知'}
                </Copy>
              </Section>
            ))}
          </Section>
          <Section title="平仓片段">
            {trade.closeSlices.map((slice) => (
              <Section key={slice.id}>
                <Copy>
                  {slice.occurredAt ?? '时间未知'} · 数量 {slice.quantity}
                </Copy>
                <Copy>
                  毛盈亏 {slice.grossRealizedPnl ?? '未知'} · 净盈亏{' '}
                  {slice.netRealizedPnl ?? '未知'}
                </Copy>
                <Action
                  label={sliceId === slice.id ? '已选择此片段' : '选择此片段'}
                  onPress={() => setSliceId(slice.id)}
                />
              </Section>
            ))}
          </Section>
          <Section title="公司行动与分红">
            {trade.corporateActions.map((event) => (
              <Copy key={event.id}>
                {event.occurredAt ?? '时间未知'} ·{' '}
                {event.type === 'BONUS_SHARE' ? '送股' : '拆分或合并'} ·{' '}
                {event.quantity ?? `${event.fromUnits ?? ''} → ${event.toUnits ?? ''}`}
              </Copy>
            ))}
            {trade.dividendAttributions.map((dividend) => (
              <Copy key={dividend.id}>
                分红 {dividend.amount} {dividend.currency}
              </Copy>
            ))}
          </Section>
          <Section title="证据引用">
            {trade.evidenceSources.map((source) => (
              <Copy key={source.id}>
                {source.source.channel} · 事件 {source.eventId} · 事实 {source.factId}
              </Copy>
            ))}
          </Section>
          <OpeningBoundaryForm trade={trade} />
          <Action label="定位投资复盘对象" onPress={review} />
        </>
      ) : null}
    </Page>
  );
}
