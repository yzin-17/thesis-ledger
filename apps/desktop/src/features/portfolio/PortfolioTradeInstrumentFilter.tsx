import type { TradeInstrumentsResponse } from '@thesis-ledger/api-client';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  let label = options.find((option) => option.value === (symbol || 'all'))?.label ?? '全部标的';
  if (loading) label = '正在读取标的';
  else if (unavailable) label = '标的暂不可用';
  return (
    <div className="flex min-w-0 flex-col gap-1 text-xs font-medium">
      标的筛选
      <Select
        value={symbol || 'all'}
        onValueChange={(value) => {
          if (value) onChange(value === 'all' ? '' : value);
        }}
      >
        <SelectTrigger
          aria-label="交易标的筛选"
          aria-busy={loading}
          disabled={loading || unavailable}
          className="w-full bg-background"
        >
          <SelectValue>{label}</SelectValue>
        </SelectTrigger>
        <SelectContent align="start" alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}
