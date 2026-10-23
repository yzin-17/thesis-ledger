import { useState } from 'react';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import type { MarketStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Action, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { initialMarketFilters, MarketChartControls } from './MarketChartControls';
import { MarketChartPanel } from './MarketChartPanel';
import { MarketQuotePanel } from './MarketQuotePanel';
export function MarketDetailScreen() {
  const { params } = useRoute<RouteProp<MarketStackParams, 'MarketDetail'>>();
  const { mode } = useMobileRuntime();
  if (params.mode && params.mode !== mode)
    return (
      <Page title="标的行情">
        <Copy>原持仓不在当前范围，请返回重新选择。</Copy>
      </Page>
    );
  return <InstrumentDetail key={params.instrument.symbol} {...params} />;
}
function InstrumentDetail({ instrument }: MarketStackParams['MarketDetail']) {
  const { api, scope } = useMobileRuntime();
  const navigation = useNavigation<NativeStackNavigationProp<MarketStackParams>>();
  const [filters, setFilters] = useState(initialMarketFilters);
  const fund = instrument.assetType === 'MUTUAL_FUND';
  const quote = useQuery({
    queryKey: [...scope, 'market-summary', instrument.symbol, fund],
    queryFn: ({ signal }) =>
      api.market.getDetail(instrument.symbol, {
        include: fund ? ['fund-nav', 'fund-nav-history'] : ['quote'],
        navLimit: 90,
        signal,
      }),
  });
  return (
    <Page
      title={instrument.name}
      action={
        <Action label="刷新报价" disabled={quote.isFetching} onPress={() => void quote.refetch()} />
      }
    >
      <Copy>
        {instrument.symbol} · {instrument.market} · {fund ? '场外基金' : '证券行情'}
      </Copy>
      <QueryStatus query={quote} retry={() => void quote.refetch()} />
      {quote.data ? <MarketQuotePanel detail={quote.data} /> : null}
      {!fund ? (
        <>
          <MarketChartPanel
            key={JSON.stringify(filters)}
            symbol={instrument.symbol}
            filters={filters}
            onAdjustment={(adjustment) => setFilters((value) => ({ ...value, adjustment }))}
          />
          <MarketChartControls
            key={`controls:${JSON.stringify(filters)}`}
            symbol={instrument.symbol}
            filters={filters}
            onApply={setFilters}
          />
        </>
      ) : null}
      <Section title="资料与资讯">
        <Action
          label="证券资料与交易单位"
          onPress={() => navigation.navigate('MarketStatic', { instrument })}
        />
        <Action
          label="标的新闻"
          onPress={() => navigation.navigate('MarketNews', { instrument })}
        />
        <Action
          label="公告与已收录原文"
          onPress={() => navigation.navigate('MarketAnnouncements', { q: instrument.symbol })}
        />
        <Action label="已收录规则资料" onPress={() => navigation.navigate('MarketDocuments')} />
      </Section>
    </Page>
  );
}
