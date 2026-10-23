import { useState } from 'react';
import { useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import type { MarketStackParams } from '../../app/navigation-types';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Choices, Copy, Page, QueryStatus, Section } from '../../components/MobilePrimitives';
import { SourceLink } from '../../components/SourceLink';
export function MarketStaticScreen() {
  const {
    params: { instrument },
  } = useRoute<RouteProp<MarketStackParams, 'MarketStatic'>>();
  const { api, scope } = useMobileRuntime();
  const [assetType, setAssetType] = useState<'STOCK' | 'ETF'>(
    instrument.assetType === 'ETF' ? 'ETF' : 'STOCK',
  );
  const supported =
    (instrument.market === 'HK' || instrument.market === 'US') &&
    instrument.assetType !== 'MUTUAL_FUND' &&
    instrument.assetType !== 'INDEX';
  const query = useQuery({
    queryKey: [...scope, 'security-static', instrument.symbol, assetType],
    enabled: supported,
    queryFn: ({ signal }) => api.market.getSecurityStaticInfo(instrument.symbol, assetType, signal),
  });
  const lot = useQuery({
    queryKey: [...scope, 'security-lot', instrument.symbol],
    enabled: instrument.market === 'HK',
    queryFn: ({ signal }) => api.market.getSecurityLotSize(instrument.symbol, signal),
  });
  const data = query.data;
  return (
    <Page title="证券资料与交易单位">
      <Copy>
        {instrument.name} · {instrument.symbol} · {instrument.market}
      </Copy>
      {supported ? (
        <>
          <Choices
            label="静态资料资产类型"
            value={assetType}
            options={[
              { value: 'STOCK', label: '股票' },
              { value: 'ETF', label: 'ETF' },
            ]}
            onChange={setAssetType}
          />
          <QueryStatus query={query} retry={() => void query.refetch()} />
          {data ? (
            <Section title={data.name ?? instrument.name}>
              <Copy>
                市场 {data.market} · 交易所 {data.exchange ?? '未提供'}
              </Copy>
              <Copy>
                上市日 {data.listingDate ?? '未知'} · 退市状态{' '}
                {data.delisted === null ? '未知' : String(data.delisted ? '已退市' : '未退市')}
              </Copy>
              <Copy>
                每手股数 {data.sharesPerLot ?? '未知'} · 证券身份 {data.securityId ?? '未提供'}
              </Copy>
              <Copy muted>
                来源 {data.provider} · 观察 {data.observedAt} · 抓取 {data.fetchedAt}
              </Copy>
              <Copy muted>当前资料值；历史变更尚未核验。</Copy>
            </Section>
          ) : null}
        </>
      ) : (
        <Copy muted>当前静态资料接口只提供港美股票与 ETF；此标的暂不支持。</Copy>
      )}
      {instrument.market === 'HK' ? (
        <Section title="港股每手参考">
          <QueryStatus query={lot} retry={() => void lot.refetch()} />
          {lot.data ? (
            <>
              <Copy>
                {lot.data.sharesPerLot} 股／手 · 来源 {lot.data.source.provider}
              </Copy>
              <Copy muted>观察 {lot.data.source.observedAt} · 历史变更尚未核验。</Copy>
              <SourceLink url={lot.data.source.sourceUrl} label="查看交易单位来源" />
            </>
          ) : null}
        </Section>
      ) : null}
      <Copy muted>
        交易规则的完整适用范围与有效日期请在“已收录规则资料”核对；资料可读不代表交易规则已经获准执行。
      </Copy>
    </Page>
  );
}
