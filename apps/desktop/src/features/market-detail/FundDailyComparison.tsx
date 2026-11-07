import {
  formatDecimalNumber,
  formatDecimalRatioPercent,
  formatMarketNumber,
  formatRatioPercent,
} from '@thesis-ledger/domain';
import { useQuery } from '@tanstack/react-query';
import { getDesktopApiClient } from '../../shared/api/client.js';
import { Button } from '@/components/ui/button';

export function FundDailyComparison({ symbol }: { symbol: string }) {
  const query = useQuery({
    queryKey: ['market', 'fund-daily-error', symbol],
    queryFn: ({ signal }) => getDesktopApiClient().market.getFundDailyError(symbol, signal),
    retry: false,
  });
  if (query.isError)
    return (
      <p>
        收盘估算误差读取失败{' '}
        <Button size="sm" variant="link" onClick={() => void query.refetch()}>
          重新读取
        </Button>
      </p>
    );
  const row = query.data;
  if (!row) return null;
  return (
    <section aria-label="收盘估算误差" className="grid gap-1 border-b pb-3">
      <strong>收盘估算误差 · {row.day}</strong>
      <p>
        收盘估算 {formatMarketNumber(row.estimatedNav, 'valuation')} · 定价覆盖{' '}
        {formatRatioPercent(row.pricedCoverage)}
        {row.quality === 'low_coverage' ? '（低覆盖）' : ''}
      </p>
      {row.errors && row.official ? (
        <p>
          正式净值 {formatMarketNumber(row.official.unitNav)} · 估算差额{' '}
          {formatDecimalNumber(row.errors.signed, 'exceptZero')} · 相对绝对误差{' '}
          {formatDecimalRatioPercent(row.errors.relativeAbsolute)}
        </p>
      ) : (
        <p>待同日正式净值</p>
      )}
    </section>
  );
}
