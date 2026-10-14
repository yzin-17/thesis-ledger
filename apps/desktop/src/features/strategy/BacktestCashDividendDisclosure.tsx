import type { BacktestCashDividendDisclosureV3 } from '@thesis-ledger/schemas';
import { formatDateOnly, formatDateTime } from '@/lib/date-display';

const statuses = {
  paid: '已发放',
  receivable: '尚未发放，保留应收',
  unavailable: '未成功入账',
} as const;
export function BacktestCashDividendDisclosure({
  disclosure,
}: {
  disclosure: BacktestCashDividendDisclosureV3 | undefined;
}) {
  if (!disclosure) return null;
  return (
    <div className="flex flex-col gap-2">
      <p>
        现金分红按登记资格在除息日确认应收，发放日按开盘到账模型结算；盘中到账时刻、拆分、分红税费及历史首次可见时钟未纳入。
      </p>
      {disclosure.records.length === 0 && <p>本次冻结窗口未包含现金分配事件。</p>}
      {disclosure.records.map((record) => (
        <div key={`${record.symbol}:${record.effectiveDate}`} className="flex flex-col gap-1">
          <p>
            {record.symbol} · 每份 {record.amountPerFundUnit} 元 · {statuses[record.status]}
          </p>
          <p>
            登记日 {formatDateOnly(record.recordDate)} · 除息日{' '}
            {formatDateOnly(record.effectiveDate)} · 发放日 {formatDateOnly(record.paymentDate)}
          </p>
          <p>
            获得资格数量 {record.eligibleQuantity ?? '未知'} 份 · 总现金分配{' '}
            {record.grossCashAmount ?? '未知'} 元
          </p>
          {record.reason && <p>{record.reason}</p>}
          <p className="break-all">
            来源 {record.provider} · 版本 {record.providerRevision} · 实际核验{' '}
            {formatDateTime(record.observedAt)}
          </p>
          {record.sourceDocuments.map((document) => (
            <p key={document.id} className="break-all">
              <a
                href={document.url}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                {document.title}
              </a>{' '}
              · 原件摘要 {document.sha256}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
