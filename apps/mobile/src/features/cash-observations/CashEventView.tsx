import type { LedgerEvent } from '@thesis-ledger/schemas';
import { Copy, Section } from '../../components/MobilePrimitives';
const categories = {
  DEPOSIT: '入账',
  WITHDRAWAL: '出账',
  TRANSFER: '划转',
  INTEREST: '利息',
  FEE: '费用',
  TAX: '税费',
};
const actions = { CREATE: '新增', REPLACE: '更正', VOID: '作废', RESTORE: '恢复' };
export function CashEventView({ event }: { event: LedgerEvent }) {
  if (event.revisionAction === 'VOID')
    return (
      <Copy>
        已作废 · {event.reason} · 修订 {event.ledgerRevision}
      </Copy>
    );
  if (event.type === 'CASH_BALANCE_OBSERVATION')
    return (
      <Section title="现金快照">
        <Copy>
          {event.payload.amount} {event.payload.currency} · {event.occurredAt ?? '时间未知'}
        </Copy>
        <Copy muted>
          账本修订 {event.ledgerRevision} · {event.recordedAt}
        </Copy>
      </Section>
    );
  if (event.type === 'CASH_FLOW')
    return (
      <Section title={`${categories[event.payload.category]} · ${actions[event.revisionAction]}`}>
        <Copy>
          {event.payload.direction === 'INFLOW' ? '流入' : '流出'} {event.payload.amount}{' '}
          {event.payload.currency}
        </Copy>
        <Copy>发生时间 {event.occurredAt ?? '未知'}</Copy>
        <Copy muted>
          预计结算 {event.payload.expectedAt ?? '未指定'} · 实际结算{' '}
          {event.payload.settledAt ?? '未指定'}
        </Copy>
        {event.payload.transfer ? (
          <Copy>关联账户 {event.payload.transfer.counterpartyAccountId}</Copy>
        ) : null}
        {event.payload.note ? <Copy>{event.payload.note}</Copy> : null}
        <Copy muted>
          账本修订 {event.ledgerRevision} · {event.recordedAt}
        </Copy>
      </Section>
    );
  return null;
}
