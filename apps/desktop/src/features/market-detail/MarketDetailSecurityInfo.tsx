import { useQuery } from '@tanstack/react-query';
import { securityStaticSymbolSchema, type SecurityStaticAssetType, type SecurityStaticInfoResponse } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LoadingState } from '@/components/ui/spinner';
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table';
import { fetchSecurityStaticInfo } from '../market-data/security-static-info.api.js';
import { marketDataKeys } from '../market-data/market-data.queries.js';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { RefreshIconButton } from '../shared/RefreshIconButton.js';
import type { MarketDetailPosition } from './market-detail.types.js';

function securityInfoRows(data: SecurityStaticInfoResponse): [string, string][] {
  let delisted = '未知';
  if (data.delisted === true) delisted = '是';
  else if (data.delisted === false) delisted = '否';
  return [
    ['证券', data.symbol], ['名称', data.name ?? '未知'], ['证券 ID', data.securityId ?? '未知'],
    ['每手股数', data.sharesPerLot ?? '未知'], ['供应商上市日期（未核验）', data.listingDate ?? '未知'],
    ['当前退市标志', delisted], ['交易所', data.exchange ?? '未知'], ['来源', '富途 OpenAPI'],
    ['观察时间', new Date(data.observedAt).toLocaleString('zh-CN')],
  ];
}

export function MarketDetailSecurityInfo({ position }: { position: MarketDetailPosition }) {
  let assetType: SecurityStaticAssetType | undefined;
  if (position.asset.assetType === 'stock') assetType = 'STOCK';
  else if (position.asset.assetType === 'etf') assetType = 'ETF';
  if (!assetType || !securityStaticSymbolSchema.safeParse(position.symbol).success) return null;
  return <SecurityInfo symbol={position.symbol} assetType={assetType} />;
}

function SecurityInfo({ symbol, assetType }: { symbol: string; assetType: SecurityStaticAssetType }) {
  const query = useQuery({
    queryKey: marketDataKeys.securityStaticInfo(symbol, assetType),
    queryFn: ({ signal }) => fetchSecurityStaticInfo(symbol, assetType, signal),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const data = query.data;
  return (
    <Card aria-label="证券资料">
      <CardHeader>
        <CardTitle className="text-xl">证券资料</CardTitle>
        <CardDescription>当前资料，历史变更未核验。</CardDescription>
        <CardAction>
          <RefreshIconButton label="刷新证券资料" refreshing={query.isFetching} onClick={() => void query.refetch()} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {query.isPending && query.isFetching && <LoadingState label="正在读取证券资料" />}
        {query.isError && <Alert variant="destructive">
          <AlertTitle>{data ? '证券资料刷新失败' : '证券资料未读取'}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            {data && <span>已保留上次资料。</span>}
            <span>{requestFailureMessage(query.error, '证券资料暂时无法读取，请稍后重试。')}</span>
            <Button variant="outline" size="sm" disabled={query.isFetching} onClick={() => void query.refetch()}>重试证券资料</Button>
          </AlertDescription>
        </Alert>}
        {data && <Table className="table-fixed" frame="plain" refreshing={query.isFetching} refreshLabel="正在刷新证券资料" aria-label={`${symbol} 证券资料`}>
          <TableBody>{securityInfoRows(data).map(([label, value]) => <TableRow key={label}>
            <TableCell className="w-2/5 whitespace-normal text-muted-foreground">{label}</TableCell>
            <TableCell className="whitespace-normal break-all">{value}</TableCell>
          </TableRow>)}</TableBody>
        </Table>}
        {data?.listingDate && <p className="m-0 text-xs text-muted-foreground">上市日期来自供应商已废弃字段，仅供参考。</p>}
      </CardContent>
    </Card>
  );
}
