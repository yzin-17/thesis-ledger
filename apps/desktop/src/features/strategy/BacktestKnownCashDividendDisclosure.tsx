import type { BacktestKnownCashDisclosureV3 } from '@thesis-ledger/schemas';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';

const statuses = {
  'simulated-paid': '按计划模拟发放',
  receivable: '保留应收，尚未模拟发放',
  unavailable: '未成功入账',
  'not-adopted': '本次未采用',
} as const;
const units = { 'per-ten-fund-units': '元/10份', 'per-fund-unit': '元/份' } as const;
export function BacktestKnownCashDividendDisclosure({
  disclosure,
}: {
  disclosure: BacktestKnownCashDisclosureV3 | undefined;
}) {
  if (!disclosure) return null;
  return (
    <div className="flex flex-col gap-2">
      <p>
        按来源记录／假设模拟：覆盖未知，遗漏事件不纳入，零条不证明零分红，结果不代表完整历史总收益。分红资格按本次冻结版本计算，除息日确认税前应收，按记录发放日开盘模拟结算；实际到账、税费、拆分及历史首次可见时间未验证。
      </p>
      <p>
        资格规则：
        {disclosure.policy.entitlement === 'cn-etf-record-close-holdings-v2'
          ? '登记日交易结束后的成交持有份额（新版本，含当日买入、扣除当日卖出）'
          : '登记日已结算持仓（legacy旧版本，仅历史重放）'}
        ；与可卖数量及资金结算分别计算。
      </p>
      {disclosure.assessment && (
        <p>
          本次响应完整取得；历史覆盖未验证 · 标准化排除原记录{' '}
          {disclosure.assessment.counts.excluded} · 重复 {disclosure.assessment.counts.duplicate} ·
          窗口外 {disclosure.assessment.counts['outside-window']} · 研究选择：
          {disclosure.policy.uncertainRecords === 'assume-scheduled'
            ? '显式假设采用未知记录'
            : '仅采用明确或具体事件已核对记录'}
        </p>
      )}
      <p>
        本次取得 {disclosure.records.length} 条有效记录 · 本次采用{' '}
        {disclosure.records.filter((record) => record.status !== 'not-adopted').length} 条 ·
        本次未采用 {disclosure.records.filter((record) => record.status === 'not-adopted').length}{' '}
        条 · 忽略空占位 {disclosure.ignoredEmptyRows} 条
      </p>
      <p>
        交易所身份按请求绑定；基金代码回显或请求绑定依据随原记录保存。币种采用显式CNY研究范围，历史身份未验证。
      </p>
      <p className="break-all">
        现金来源 {disclosure.source.target.providerId} / {disclosure.source.target.upstreamSource} ·
        来源观察 {formatDateTime(disclosure.source.observedAt)} · 版本{' '}
        {disclosure.source.providerRevision} · 原响应摘要 {disclosure.source.responseSha256}
      </p>
      {disclosure.records.map((record) => (
        <div key={`${record.symbol}:${record.effectiveDate}`} className="flex flex-col gap-1">
          <p>
            {record.symbol} · 每份 {record.amountPerFundUnit} 元 · {statuses[record.status]}
          </p>
          <p>
            原金额 {record.sourceAmount.value} {units[record.sourceAmount.unit]} · 原进度{' '}
            {record.sourcePlanStatus ?? '来源未提供'} ·{' '}
            {record.normalizedStatus === 'unknown' && '标准状态未知 · '}
            {record.statusBasis === 'event-reconciled' && '具体事件金额/日期已核对'}
            {record.statusBasis === 'unverified' && '语义未经核对'}
            {record.statusBasis === 'research-assumption' && '旧版本显式方案假设'}
            {record.statusBasis === 'source-defined' && '来源明确状态'}
          </p>
          <p>
            公告日{' '}
            {record.announcementDate === null
              ? '来源未提供'
              : formatDateOnly(record.announcementDate)}{' '}
            · 登记日 {formatDateOnly(record.recordDate)} · 除息日{' '}
            {formatDateOnly(record.effectiveDate)} · 计划发放日 {formatDateOnly(record.paymentDate)}
          </p>
          <p>
            登记资格 {record.eligibleQuantity ?? '未知'} 份 · 税前现金{' '}
            {record.grossCashAmount ?? '未知'} 元
          </p>
          {record.reason && <p>{record.reason}</p>}
          {record.issues?.length ? <p>问题：{record.issues.join('、')}</p> : null}
          {record.reconciliationReference && (
            <a href={record.reconciliationReference} target="_blank" rel="noreferrer">
              事件核对公告
            </a>
          )}
        </div>
      ))}
      {disclosure.assessment?.observations
        .filter((row) => row.disposition === 'excluded' || row.disposition === 'duplicate')
        .map((row) => (
          <p key={row.rowIndex}>
            未采用原记录 #{row.rowIndex + 1} · 原状态 {row.sourceStatus ?? '缺失'} · 除息日{' '}
            {row.effectiveDate ?? '未知'} · 原金额 {row.sourceAmount ?? '未知'} 元/10份 · 原因{' '}
            {row.issues.join('、')}
          </p>
        ))}
      <p className="break-all">冻结准备摘要 {disclosure.preparationHash}</p>
    </div>
  );
}
