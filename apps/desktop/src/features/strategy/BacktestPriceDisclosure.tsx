import {
  backtestResultSchemaV3,
  backtestUnknownListingWarningV3,
  wholeShareWindowBenchmarkCostVersionV3,
  researchLotShareWindowBenchmarkCostVersionV3,
} from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/date-display';
import { BacktestCashDividendDisclosure } from './BacktestCashDividendDisclosure.js';
import { BacktestKnownCashDividendDisclosure } from './BacktestKnownCashDividendDisclosure.js';

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

function BacktestListingNote({ warnings }: { warnings: readonly string[] }) {
  if (!warnings.includes(backtestUnknownListingWarningV3)) return null;
  return <p>{backtestUnknownListingWarningV3}</p>;
}

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
  const costVersion =
    compatibility?.costAssumption.kind === 'execution-model'
      ? compatibility.costAssumption.version
      : undefined;
  const researchLotBenchmark = costVersion === researchLotShareWindowBenchmarkCostVersionV3;
  const wholeShareBenchmark =
    costVersion === wholeShareWindowBenchmarkCostVersionV3 || researchLotBenchmark;
  let accounting = '原始实际份额记账';
  if (accountingBasis === 'normalized-series') accounting = '归一化份额研究';
  else if (value.executionPriceProtocol.cashEventResearch) accounting = '原始价格与现金分红研究';
  else if (value.executionPriceProtocol.marketRuleResearch) accounting = '原始价格与规则研究';
  let benchmark = '未提供兼容证明';
  if (compatibility?.status === 'compatible') benchmark = '收益、来源与成本协议兼容';
  else if (compatibility?.status === 'incompatible') benchmark = '协议不兼容，不计算可比超额收益';
  else if (compatibility?.status === 'unverified') benchmark = '兼容性未核实，不进入同一评价组';
  let cost = '未知';
  if (compatibility?.costAssumption.kind === 'unsupported') cost = '该冻结版本不支持所选费用规则';
  else if (compatibility?.costAssumption.kind === 'zero-cost') cost = '显式零成本假设';
  else if (compatibility?.costAssumption.kind === 'proportional')
    cost = `佣金费率 ${compatibility.costAssumption.commissionRate}，滑点费率 ${compatibility.costAssumption.slippageRate}`;
  else if (compatibility?.costAssumption.kind === 'execution-model')
    cost = '使用同一冻结费用模型，按各自成交日期、方向和金额逐笔计费';
  if (wholeShareBenchmark) cost = '使用同一冻结公共收费与券商模型，按实际整数股及成交日期逐笔计费';
  if (researchLotBenchmark) cost = '使用同一冻结公共收费与券商模型，按每手预设和实际股数逐笔计费';
  const hasBuyAndHoldConvention = value.warnings.includes(
    'BENCHMARK_EVALUATION:v3-buy-first-in-range-close-liquidate-last-in-range-close-by-trading-date-v2',
  );
  if (value.executionPriceProtocol.cashEventResearch) {
    benchmark = '现金基准未纳入，净收益及超额比较不可用';
    cost = '策略使用冻结费用模型；基准现金与数量模型未纳入';
  } else if (value.executionPriceProtocol.marketRuleResearch && !wholeShareBenchmark) {
    benchmark = '规则研究基准未纳入，净收益及超额比较不可用';
    cost = '策略使用冻结费用与状态规则；基准实际数量与状态模型未纳入';
  }
  let convention =
    '基准按首个对齐日收盘买入、最后对齐日收盘清算；净收益差为策略净收益减基准净收益。';
  if (wholeShareBenchmark)
    convention =
      '基准以含买侧费用的预算买入最大整数股并保留余款，末日收盘扣卖侧费清算；净收益差为策略净收益减基准净收益。';
  if (researchLotBenchmark)
    convention =
      '基准按冻结每手股数买入预算内最大整手数量，买侧费用纳入预算并保留余款；末日扣卖侧费清算。';
  return (
    <Alert>
      <AlertTitle>本次运行的价格与记账协议</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {adjustments[priceBasis.adjustment]} · {accounting}
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
        <BacktestListingNote warnings={value.warnings} />
        <BacktestCashDividendDisclosure disclosure={value.cashDividendDisclosure} />
        <BacktestKnownCashDividendDisclosure disclosure={value.knownCashDividendDisclosure} />
        {value.executionPriceProtocol.marketRuleResearch && (
          <p>
            本次使用原始价格和实际份额研究收费与状态，未纳入分红、拆合股等公司行动；不表示事件覆盖或严格历史时点已验证。
          </p>
        )}
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
        {hasBuyAndHoldConvention &&
          !value.executionPriceProtocol.cashEventResearch &&
          (!value.executionPriceProtocol.marketRuleResearch || wholeShareBenchmark) && (
            <p>{convention}</p>
          )}
        <p>
          重放版本：{value.engineVersion} · {value.snapshotVersion}
        </p>
      </AlertDescription>
    </Alert>
  );
}
