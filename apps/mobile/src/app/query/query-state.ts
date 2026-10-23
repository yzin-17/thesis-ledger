import type { PortfolioValuationResponse } from '@thesis-ledger/api-client';
import type { MobileLoadState } from '../../index';

export function valuationLoadState(query: {
  data: PortfolioValuationResponse | undefined;
  isPending: boolean;
  isError: boolean;
}): MobileLoadState {
  if (query.isError) return 'error';
  if (query.isPending && !query.data) return 'loading';
  if (!query.data) return 'empty';
  if (query.data.partial || query.data.positions.some((position) => position.stale)) return 'stale';
  if (query.data.positions.length === 0 && query.data.cashValue === 0) return 'empty';
  return 'ready';
}

type WriteRead = { isError: boolean; isFetching: boolean; data: unknown };
export function canUseReadForWrite(read: WriteRead) {
  return !read.isError && !read.isFetching && Boolean(read.data);
}
export function assertWritable(read: WriteRead) {
  if (!canUseReadForWrite(read)) throw new Error('账户数据尚未确认，请重新读取后再提交。');
}
