import {
  formatDecimalNumber,
  formatDecimalRatioPercent,
  formatMarketNumber,
  formatRatioPercent,
} from '@thesis-ledger/domain';
import { useQuery } from '@tanstack/react-query';
import { useMobileRuntime } from '../../app/MobileRuntime';
import { Copy, QueryStatus, Section } from '../../components/MobilePrimitives';

export function DailyFundComparison({ symbol }: { symbol: string }) {
  const { api, scope } = useMobileRuntime();
  const query = useQuery({
    queryKey: [...scope, 'fund-daily-error', symbol],
    queryFn: ({ signal }) => api.market.getFundDailyError(symbol, signal),
    retry: false,
  });
  const row = query.data;
  return (
    <Section title="收盘估算误差">
      <QueryStatus query={query} retry={() => void query.refetch()} />
      {query.isSuccess && !row && <Copy>尚无有效收盘估算</Copy>}
      {row && (
        <Copy>
          {row.day} · 收盘估算 {formatMarketNumber(row.estimatedNav, 'valuation')} · 定价覆盖{' '}
          {formatRatioPercent(row.pricedCoverage)}
          {row.quality === 'low_coverage' ? '（低覆盖）' : ''} ·{' '}
          {row.errors && row.official
            ? `正式净值 ${formatMarketNumber(row.official.unitNav)}，估算差额 ${formatDecimalNumber(row.errors.signed, 'exceptZero')}，相对绝对误差 ${formatDecimalRatioPercent(row.errors.relativeAbsolute)}`
            : '待同日正式净值'}
        </Copy>
      )}
    </Section>
  );
}
