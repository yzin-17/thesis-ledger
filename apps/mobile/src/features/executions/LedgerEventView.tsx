import type { LedgerEvent } from '@thesis-ledger/api-client';
import { Copy, Section } from '../../components/MobilePrimitives';
import { isExecution } from './execution-command';
const typeLabels: Record<LedgerEvent['type'], string> = {
  BUY_EXECUTION: '买入成交',
  SELL_EXECUTION: '卖出成交',
  POSITION_BASELINE_OBSERVATION: '持仓快照',
  TRADE_OPENING_BOUNDARY_ASSERTION: '建仓时间补录',
  CASH_BALANCE_OBSERVATION: '现金快照',
  BASELINE_RECONCILIATION: '基线对账',
  BONUS_SHARE: '送股',
  SPLIT: '拆分',
  MERGE: '合并',
  DIVIDEND: '分红',
  CASH_FLOW: '现金流',
};
const actionLabels = { CREATE: '新增', REPLACE: '更正', VOID: '作废', RESTORE: '恢复' };
export function LedgerEventView({ event }: { event: LedgerEvent }) {
  return (
    <Section title={`${typeLabels[event.type]} · ${actionLabels[event.revisionAction]}`}>
      <Copy>
        {event.occurredAt ?? '业务时间未知'} · {event.sourceTimezone}
      </Copy>
      {isExecution(event) ? (
        <>
          <Copy>
            {event.payload.symbol} · 数量 {event.payload.quantity} · 价格 {event.payload.price}{' '}
            {event.payload.currency}
          </Copy>
          {event.payload.charges.map((charge, index) => (
            <Copy key={index}>
              费用 {charge.amount} {charge.currency}
              {charge.description ? ` · ${charge.description}` : ''}
            </Copy>
          ))}
        </>
      ) : null}
      {event.revisionAction !== 'VOID' && event.type === 'POSITION_BASELINE_OBSERVATION' ? (
        <Copy>
          {event.payload.symbol} · 数量 {event.payload.quantity} · 均价{' '}
          {event.payload.averageCost ?? '未知'} {event.payload.currency}
        </Copy>
      ) : null}
      <Copy muted>
        账本修订 {event.ledgerRevision} · 记录时间 {event.recordedAt}
      </Copy>
      <Copy muted>
        事件 {event.eventId} · 事实 {event.factId}
      </Copy>
      <Copy muted>
        来源 {event.source.channel} · 操作者 {event.actorId}
      </Copy>
      {event.reason ? <Copy>原因：{event.reason}</Copy> : null}
    </Section>
  );
}
