import { backtestResultSchemaV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/date-display';

const adjustments = { none: '不复权', qfq: '前复权', hfq: '后复权' } as const;
const purposes = {
  execution: '成交',
  signal: '信号',
  benchmark: '基准',
  fx: '汇率',
  corporateActions: '公司行动',
  calendar: '交易日历',
  instrumentFacts: '证券事实',
  nav: '净值',
};
const dividends = {
  'explicit-cash': '显式现金分红',
  'embedded-verified': '已核实包含分红效应',
  'provider-defined': '供应商定义，含义未完全确认',
};

export function BacktestPriceDisclosure({ result }: { result: unknown }) {
  const parsed = backtestResultSchemaV3.safeParse(result);
  if (!parsed.success)
    return (
      <Alert variant="destructive">
        <AlertTitle>运行协议无法读取</AlertTitle>
        <AlertDescription>结果未通过V3合同校验，无法确认来源与比较语义。</AlertDescription>
      </Alert>
    );
  const value = parsed.data;
  const { priceBasis, accountingBasis, history } = value.executionPriceProtocol;
  const compatibility = value.benchmarkCompatibility;
  let benchmark = '未提供兼容证明';
  if (compatibility?.status === 'compatible') benchmark = '收益、来源与成本协议兼容';
  else if (compatibility?.status === 'incompatible') benchmark = '协议不兼容，不计算可比超额收益';
  else if (compatibility?.status === 'unverified') benchmark = '兼容性未核实，不进入同一评价组';
  let cost = '未知';
  if (compatibility?.costAssumption.kind === 'unsupported') cost = '当前成本模型不支持';
  else if (compatibility?.costAssumption.kind === 'zero-cost') cost = '显式零成本假设';
  else if (compatibility?.costAssumption.kind === 'proportional')
    cost = `佣金费率 ${compatibility.costAssumption.commissionRate}，滑点费率 ${compatibility.costAssumption.slippageRate}`;
  return (
    <Alert>
      <AlertTitle>本次运行的价格与记账协议</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {adjustments[priceBasis.adjustment]} ·{' '}
          {accountingBasis === 'normalized-series' ? '归一化份额研究' : '原始实际份额记账'}
        </p>
        {accountingBasis === 'normalized-series' && (
          <p>数量为模拟归一化单位，不代表历史实际持有份额；本次未另行注入现金分红。</p>
        )}
        <p>
          历史输入：
          {history.basis === 'fixed-provider-snapshot'
            ? '固定供应商快照，可能包含后来事件影响'
            : '严格历史时点输入'}
        </p>
        <p>
          分红含义：{dividends[priceBasis.dividendMeaning]}；观察时间：
          {formatDateTime(priceBasis.observedAt)}
        </p>
        {value.actualSources.map((source, index) => (
          <p key={index}>
            {purposes[source.purpose]}：{source.symbol} · {source.provenance.providerId} /{' '}
            {source.provenance.upstreamSource} ·{' '}
            {source.provenance.routeIndex === 0 ? '主源' : '备用源'}
          </p>
        ))}
        <p>
          基准比较：{benchmark}；成本：{cost}
        </p>
        <p>
          重放版本：{value.engineVersion} · {value.snapshotVersion}
        </p>
      </AlertDescription>
    </Alert>
  );
}
