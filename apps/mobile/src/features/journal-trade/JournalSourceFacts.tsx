import type { JournalReviewEvidenceInput } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';
export function JournalSourceFacts({ input }: { input: JournalReviewEvidenceInput }) {
  const reference = input.reference;
  const slices = input.trade.closeSlices.filter(
    (row) => reference.reviewObjectType === 'TRADE_CYCLE' || row.id === reference.closeSliceId,
  );
  const owns = (id: string) =>
    reference.reviewObjectType === 'TRADE_CYCLE' ||
    slices.some((s) => s.allocations.some((a) => a.sourceFactId === id));
  return (
    <>
      <Section title="真实退出成交">
        {slices.map((row) => (
          <Section key={row.id}>
            <Copy>
              {row.occurredAt ?? '时间未知'} · 数量 {row.quantity} · 价格 {row.price ?? '未知'}{' '}
              {row.currency}
            </Copy>
            <Copy>
              净收益 {row.netRealizedPnl ?? '不可用'} · 费用{' '}
              {row.charges.map((c) => `${c.amount} ${c.currency}`).join(' + ') || '无费用记录'}
            </Copy>
          </Section>
        ))}
      </Section>
      <Section title="入场成交来源">
        {input.trade.entryLegs
          .filter((row) => owns(row.factId))
          .map((row) => (
            <Copy key={row.id}>
              {row.occurredAt ?? '时间未知'} · 原始数量 {row.originalQuantity} · 价格{' '}
              {row.price ?? '未知'} {row.currency}
            </Copy>
          ))}
      </Section>
      {input.trade.baselineComponents
        .filter((row) => owns(row.factId))
        .map((row) => (
          <Section key={row.id} title="基线观察">
            <Copy>
              {row.occurredAt ?? '时间未知'} · 数量 {row.observedQuantity} · 参考成本{' '}
              {row.averageCost ?? '未知'} {row.currency}
            </Copy>
            <Copy muted>基线观察不能作为实际成交价。</Copy>
          </Section>
        ))}
      <Section title="原始计划与记录">
        <Copy>
          计划入场 {input.plan?.plannedEntry ?? '未提供'} · 计划离场{' '}
          {input.plan?.plannedExit ?? '未提供'} · 止损 {input.plan?.stopLoss ?? '未提供'}
        </Copy>
        <Copy>{input.plan?.thesis ?? input.plan?.reason ?? '未提供计划说明'}</Copy>
        {input.journalEntries.map((row, i) => (
          <Copy key={i}>
            {row.createdAt ?? '时间未知'} · {row.content ?? row.notes ?? row.reason ?? ''}
          </Copy>
        ))}
      </Section>
    </>
  );
}
