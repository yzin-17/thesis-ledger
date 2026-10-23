import type { MarketDisplayDetailResponse } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';
import { MobileChart } from '../../platform/charts/MobileChart';
export function MarketQuotePanel({ detail }: { detail: MarketDisplayDetailResponse }) {
  return (
    <>
      {Object.values(detail.sections).map((section) => {
        if (!section) return null;
        if (
          section.capability === 'quote' &&
          section.data &&
          (section.status === 'ready' || section.status === 'stale')
        ) {
          const quote = section.data;
          return (
            <Section key="quote" title="当前报价">
              <Copy>
                {quote.price} {quote.units?.priceCurrency ?? '币种未提供'} ·{' '}
                {quote.stale ? '行情陈旧' : '最新读取'}
              </Copy>
              <Copy>
                开盘 {quote.open} · 最高 {quote.high} · 最低 {quote.low} · 前收{' '}
                {quote.previousClose}
              </Copy>
              <Copy muted>
                来源 {quote.provider} · 行情时间 {quote.marketTime ?? '未知'} · 抓取{' '}
                {quote.fetchedAt}
              </Copy>
            </Section>
          );
        }
        if (
          section.capability === 'fund-nav' &&
          section.data &&
          (section.status === 'ready' || section.status === 'stale')
        )
          return (
            <Section key="nav" title="单位净值">
              <Copy>
                {section.data.unitNav} · 净值日 {section.data.navDate}
              </Copy>
              <Copy muted>
                来源 {section.data.provider} · 抓取 {section.data.fetchedAt} ·{' '}
                {section.status === 'stale' ? '陈旧' : '延迟披露'}
              </Copy>
            </Section>
          );
        if (
          section.capability === 'fund-nav-history' &&
          section.data &&
          (section.status === 'ready' || section.status === 'stale')
        )
          return (
            <Section key="nav-history" title="净值历史">
              {section.data.length ? (
                <MobileChart
                  data={{
                    main: 'line',
                    candles: section.data.map((point) => ({
                      time: Math.floor(Date.parse(point.navDate) / 1000),
                      open: point.unitNav,
                      high: point.unitNav,
                      low: point.unitNav,
                      close: point.unitNav,
                    })),
                    lines: [],
                  }}
                />
              ) : (
                <Copy>当前没有净值历史。</Copy>
              )}
              {section.data.slice(-5).map((point) => (
                <Copy key={point.navDate}>
                  {point.navDate} · {point.unitNav} · {point.provider}
                </Copy>
              ))}
            </Section>
          );
        return (
          <Section key={section.capability}>
            <Copy>{section.error?.message ?? '当前能力暂无可用数据。'}</Copy>
          </Section>
        );
      })}
    </>
  );
}
