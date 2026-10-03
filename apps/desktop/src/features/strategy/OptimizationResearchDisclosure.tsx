import { runConfigSchemaV3 } from '@thesis-ledger/schemas';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatDateTime } from '@/lib/date-display';

const adjustmentLabels = { none: '不复权', qfq: '前复权', hfq: '后复权' } as const;
const dividendLabels = {
  'explicit-cash': '显式现金分红',
  'embedded-verified': '已核实包含分红效应',
  'provider-defined': '供应商定义，分红含义未完全确认',
} as const;

export function OptimizationResearchDisclosure({ runConfig }: { runConfig: unknown }) {
  const parsed = runConfigSchemaV3.safeParse(runConfig);
  if (!parsed.success)
    return (
      <Alert>
        <AlertTitle>实验价格协议未确认</AlertTitle>
        <AlertDescription>旧记录或配置未通过校验，无法确认价格口径与历史性质。</AlertDescription>
      </Alert>
    );
  const config = parsed.data;
  const { priceBasis, accountingBasis, history } = config.executionPriceProtocol;
  return (
    <Alert>
      <AlertTitle>实验冻结的研究协议</AlertTitle>
      <AlertDescription className="flex flex-col gap-2">
        <p>
          {adjustmentLabels[priceBasis.adjustment]} ·{' '}
          {accountingBasis === 'normalized-series' ? '归一化份额研究' : '原始实际份额记账'}
        </p>
        <p>
          {history.basis === 'fixed-provider-snapshot'
            ? '固定供应商快照可能包含后来事件影响；即使测试集尚未揭示，也不构成严格无前视的样本外验证。'
            : '严格历史时点输入，数据可见性受历史决策时钟约束。'}
        </p>
        {accountingBasis === 'normalized-series' && (
          <p>数量为模拟归一化单位，不代表历史实际持仓；未另行注入现金分红。</p>
        )}
        <p>
          分红：{dividendLabels[priceBasis.dividendMeaning]}；冻结时间：
          {formatDateTime(config.dataAsOf)}
        </p>
        <p>各次运行的实际来源与重放版本见对应回测结果。</p>
      </AlertDescription>
    </Alert>
  );
}
