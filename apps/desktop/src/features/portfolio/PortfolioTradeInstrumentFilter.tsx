import type { TradeInstrumentsResponse } from '@thesis-ledger/api-client';
import { InstrumentOptionField } from '../market-data/InstrumentOptionField.js';

export function PortfolioTradeInstrumentFilter({
  items,
  symbol,
  loading,
  unavailable,
  onChange,
}: {
  items: TradeInstrumentsResponse['items'];
  symbol: string;
  loading: boolean;
  unavailable: boolean;
  onChange: (symbol: string) => void;
}) {
  const options = [
    { value: 'all', label: '全部标的' },
    ...items.map((item) => ({
      value: item.symbol,
      label:
        item.displayName === item.symbol ? item.symbol : `${item.displayName} · ${item.symbol}`,
    })),
  ];
  let status = '';
  if (loading) status = '正在读取标的';
  else if (unavailable) status = '标的暂不可用';
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-medium">
      标的筛选
      <InstrumentOptionField
        label="交易标的筛选"
        value={symbol || 'all'}
        options={options}
        status={status}
        disabled={loading || unavailable}
        onChange={(value) => onChange(value === 'all' ? '' : value)}
      />
    </div>
  );
}
