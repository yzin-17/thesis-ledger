import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import { canUseReadForWrite } from '../../app/query/query-state';
import { Action, Copy, QueryList, Section } from '../../components/MobilePrimitives';

export function BaselinePositions({
  query,
  blocked,
  onRetry,
  onRemove,
  onClear,
}: {
  query: {
    data: PortfolioValuationResponse | undefined;
    isError: boolean;
    isPending: boolean;
    isFetching: boolean;
    error: unknown;
  };
  blocked: boolean;
  onRetry: () => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}) {
  const disabled = blocked || !canUseReadForWrite(query);
  return (
    <Section title="已有持仓">
      <QueryList
        query={query}
        retry={onRetry}
        label="正在刷新持仓快照"
        gap={12}
      >
        {query.data?.positions.map((position) => (
          <Section key={position.id}>
            <Copy>
              {position.symbol} · 数量 {position.quantity}
            </Copy>
            <Action
              label={`移除 ${position.symbol}`}
              destructive
              disabled={disabled}
              onPress={() => onRemove(position.id)}
            />
          </Section>
        ))}
      </QueryList>
      <Action
        label="清空该账户全部持仓"
        destructive
        disabled={disabled || !query.data?.positions.length}
        onPress={onClear}
      />
    </Section>
  );
}
