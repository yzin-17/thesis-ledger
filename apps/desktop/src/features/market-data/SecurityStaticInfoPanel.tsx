import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { securityStaticSymbolSchema, type SecurityStaticAssetType, type SecurityStaticInfoResponse } from '@thesis-ledger/schemas';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectGroup, SelectItem } from '@/components/ui/select';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableRow, TableCell } from '@/components/ui/table';
import { fetchSecurityStaticInfo } from './security-static-info.api.js';
import { SecurityStaticPriceDialog } from './SecurityStaticPriceDialog.js';

const assetChoices = [{ value: 'STOCK', label: '股票' }, { value: 'ETF', label: 'ETF' }];
type StaticQuery = { symbol: string; assetType: SecurityStaticAssetType };

export function SecurityStaticInfoPanel() {
  const [symbol, setSymbol] = useState('');
  const [assetType, setAssetType] = useState<SecurityStaticAssetType>('STOCK');
  const [submitted, setSubmitted] = useState<StaticQuery | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [priceSubject, setPriceSubject] = useState<SecurityStaticInfoResponse | null>(null);
  const query = useQuery({
    queryKey: ['market-data', 'security-static-info', submitted?.symbol, submitted?.assetType],
    queryFn: ({ signal }) => {
      if (!submitted) throw new Error('请先填写证券代码');
      return fetchSecurityStaticInfo(submitted.symbol, submitted.assetType, signal);
    },
    enabled: submitted !== null, retry: false, staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = securityStaticSymbolSchema.safeParse(symbol.trim().toUpperCase());
    if (!parsed.success) {
      setInputError('请输入规范港美代码，例如 00700.HK 或 AAPL.US');
      return;
    }
    setInputError(null);
    if (submitted?.symbol === parsed.data && submitted.assetType === assetType) {
      void query.refetch();
      return;
    }
    setSubmitted({ symbol: parsed.data, assetType });
  };
  const data = query.isError ? undefined : query.data;
  const rows: [string, string][] = [];
  if (data) {
    let delisted = '未知';
    if (data.delisted === true) delisted = '是';
    else if (data.delisted === false) delisted = '否';
    rows.push(['证券', data.symbol], ['名称', data.name ?? '未知'], ['证券 ID', data.securityId ?? '未知'],
      ['每手股数', data.sharesPerLot ?? '未知'], ['供应商上市日期（未核验）', data.listingDate ?? '未知'],
      ['当前退市标志', delisted], ['交易所', data.exchange ?? '未知'], ['来源', '富途 OpenAPI'],
      ['观察时间', new Date(data.observedAt).toLocaleString('zh-CN')]);
  }
  return <Card>
    <CardHeader>
      <CardTitle>当前证券资料</CardTitle>
      <CardDescription>按“路由策略”中对应市场与类型的证券静态资料来源读取。当前值未核验历史变更。</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-col gap-4">
      <form onSubmit={submit}>
        <FieldGroup>
          <Field invalid={Boolean(inputError)}>
            <FieldLabel>证券代码</FieldLabel>
            <Input aria-label="证券资料代码" aria-invalid={Boolean(inputError)} value={symbol}
              placeholder="00700.HK 或 AAPL.US" onChange={event => setSymbol(event.target.value)} />
          </Field>
          <Field>
            <FieldLabel>证券类型</FieldLabel>
            <Select items={assetChoices} value={assetType} onValueChange={value => {
              if (value === 'STOCK' || value === 'ETF') setAssetType(value);
            }}>
              <SelectTrigger aria-label="证券资料类型"><SelectValue /></SelectTrigger>
              <SelectContent><SelectGroup>{assetChoices.map(choice =>
                <SelectItem key={choice.value} value={choice.value}>{choice.label}</SelectItem>,
              )}</SelectGroup></SelectContent>
            </Select>
          </Field>
          <Button type="submit" variant="outline" disabled={query.isFetching}>
            {query.isFetching ? '查询中…' : '查询证券资料'}
          </Button>
        </FieldGroup>
      </form>
      {(inputError || query.isError) && <Alert variant="destructive">
        <AlertTitle>资料未读取</AlertTitle>
        <AlertDescription>{inputError ?? query.error?.message}</AlertDescription>
      </Alert>}
      {data && <Table aria-label={`${data.symbol} 当前证券资料`}>
        <TableBody>{rows.map(([label, value]) => <TableRow key={label}>
          <TableCell>{label}</TableCell><TableCell>{value}</TableCell>
        </TableRow>)}</TableBody>
      </Table>}
      {data?.listingDate && <p className="text-sm text-muted-foreground">
        上市日期来自供应商已废弃字段，仅供参考。
      </p>}
      {data && <Button variant="outline" onClick={() => setPriceSubject(data)}>查看行情</Button>}
      {priceSubject && <SecurityStaticPriceDialog key={`${priceSubject.symbol}:${priceSubject.assetType}`}
        info={priceSubject} onClose={() => setPriceSubject(null)} />}
    </CardContent>
  </Card>;
}
