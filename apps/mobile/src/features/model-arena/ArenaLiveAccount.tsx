import { useState } from 'react';
import {
  arenaLiveLabel,
  arenaHasDueTimeWakeup,
  arenaManualDecisionNotice,
  arenaNextDecisionLabel,
  arenaPositionTotals,
  arenaAppointmentLabel,
  arenaBudgetCountLabel,
  arenaBudgetCostLabel,
  formatDecimalNumber,
  arenaDecisionPlanLines,
  arenaOrderProtectionText,
  arenaOrderQuantityText,
  arenaMatchingText,
  arenaProtectionValidityText,
} from '@thesis-ledger/domain';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import {
  ContentSection as Section,
  Copy,
  Action,
  Choices,
  failureMessage,
} from '../../components/MobilePrimitives';
export function ArenaLiveAccount({
  detail,
  agentId,
  onRetry,
  busy,
  onTrigger,
  triggerBusy = false,
  triggerError,
  triggerAppointment,
}: {
  detail: ArenaLiveDetail;
  agentId: string;
  onRetry: () => void;
  busy: boolean;
  onTrigger?: () => void;
  triggerBusy?: boolean;
  triggerError?: unknown;
  triggerAppointment?: 'scheduled' | 'already_scheduled' | 'already_in_progress' | null;
}) {
  const [tab, setTab] = useState('research'),
    [audit, setAudit] = useState('');
  const agent = detail.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  const binding = detail.protocol.entrants.find(
    (e) => e.providerId === agent.providerId && e.model === agent.model,
  )!;
  const book = agent.account;
  const name = (s: string) => (detail.instrumentDirectory[s] ?? s) + ' · ' + s;
  const time = (at: string) =>
    new Date(at).toLocaleString('zh-CN', { timeZone: detail.protocol.timeZone });
  const clockAt = decisionClockAt(detail);
  const awaitingObservation = arenaHasDueTimeWakeup(book.wakeups, clockAt);
  const canTrigger = manualTriggerAvailable(detail, agent, awaitingObservation);
  return (
    <Section title={agent.model + ' · ' + arenaLiveLabel(agent.state)}>
      <Copy>
        现金 {formatDecimalNumber(book.cash)} · 可用{' '}
        {agent.availability.cash === null ? '待确认' : formatDecimalNumber(agent.availability.cash)}{' '}
        {detail.protocol.currency}
      </Copy>
      <Copy muted>
        剩余请求 {arenaBudgetCountLabel(agent.remaining.requests, ' 次')} · 剩余模型费用{' '}
        {arenaBudgetCostLabel(agent.remaining.costMicros, detail.protocol.budgetCurrency)}
      </Copy>
      <Copy muted>{arenaMatchingText(detail.protocol.matching)}</Copy>
      <Copy muted>
        单次输入上限 {arenaBudgetCountLabel(binding.maxInputTokens)} · 单次输出上限{' '}
        {arenaBudgetCountLabel(binding.maxOutputTokens)}
      </Copy>
      <Copy muted>
        单次研究步骤{' '}
        {detail.protocol.resources.maxResearchSteps === null
          ? '不限制'
          : detail.protocol.resources.maxResearchSteps}{' '}
        · 时限{' '}
        {detail.protocol.resources.maxCycleSeconds === null
          ? '不限制'
          : detail.protocol.resources.maxCycleSeconds + ' 秒'}
      </Copy>
      <Copy muted>
        下一次决策：
        {arenaNextDecisionLabel({
          wakeups: book.wakeups,
          matchState: detail.state,
          agentState: agent.state,
          timeZone: detail.protocol.timeZone,
          pending: agent.cycles.some((c) => c.state === 'pending'),
          clockAt,
        })}
      </Copy>
      {agent.reason && <Copy>{arenaLiveLabel(agent.reason)}</Copy>}
      {canTrigger && onTrigger && (
        <>
          <Action
            label={triggerBusy ? '正在提交预约…' : '手动触发决策'}
            disabled={triggerBusy}
            onPress={onTrigger}
          />
          <Copy muted>盘前、盘后及休市也能研究并消耗额度；下单和成交仍受开市限制。</Copy>
        </>
      )}
      {triggerAppointment && (
        <Copy>{arenaManualDecisionNotice(triggerAppointment, agent.reason)}</Copy>
      )}
      {agent.state === 'waiting' && triggerError != null && (
        <Copy>{failureMessage(triggerError)}</Copy>
      )}
      {agent.state === 'needs_attention' && detail.state === 'running' && (
        <Action label="重新预约研究" disabled={busy} onPress={onRetry} />
      )}
      <Choices
        label="账户明细"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'research', label: '研究与预约' },
          { value: 'positions', label: '持仓' },
          { value: 'orders', label: '委托' },
          { value: 'fills', label: '成交' },
        ]}
      />
      <AccountDetail
        agent={agent}
        tab={tab}
        audit={audit}
        setAudit={setAudit}
        name={name}
        time={time}
      />
    </Section>
  );
}

function decisionClockAt(detail: ArenaLiveDetail) {
  const clockAt =
    detail.timeline?.phase === 'replay'
      ? (detail.timeline.pendingAt ?? detail.timeline.cursorAt)
      : new Date().toISOString();
  return clockAt;
}

function manualTriggerAvailable(
  detail: ArenaLiveDetail,
  agent: ArenaLiveDetail['agents'][number],
  awaitingObservation: boolean,
) {
  const canTrigger =
    detail.state === 'running' &&
    agent.state === 'waiting' &&
    !awaitingObservation &&
    !agent.cycles.some((cycle) => cycle.state === 'pending' || cycle.state === 'running') &&
    (detail.timeline?.phase !== 'replay' ||
      (detail.timeline.status === 'ready' && !detail.timeline.pendingAt)) &&
    agent.remaining.requests !== 0 &&
    detail.remaining.requests !== 0;
  return canTrigger;
}

function AccountDetail({
  agent,
  tab,
  audit,
  setAudit,
  name,
  time,
}: {
  agent: ArenaLiveDetail['agents'][number];
  tab: string;
  audit: string;
  setAudit: (value: string) => void;
  name: (symbol: string) => string;
  time: (at: string) => string;
}) {
  const book = agent.account;
  return (
    <>
      {tab === 'research' && (
        <>
          {book.wakeups
            .filter((w) => !w.firedAt)
            .map((w) => (
              <Copy key={w.id}>
                {w.condition.kind === 'time'
                  ? '预约时间 · ' + time(w.condition.at)
                  : arenaAppointmentLabel(w.condition, name)}
              </Copy>
            ))}
          {!book.wakeups.some((w) => !w.firedAt) && (
            <Copy muted>
              {agent.state === 'researching' ? '正在研究，完成后更新预约' : '尚无待触发预约'}
            </Copy>
          )}
          {agent.cycles.map((c) => (
            <Section key={c.id} title={arenaLiveLabel(c.state) + ' · ' + time(c.createdAt)}>
              {c.decision && <Copy>模型摘要 · {c.decision.summary}</Copy>}
              {c.decision && arenaDecisionPlanLines(c.decision, name, book).map((line, index) => <Copy key={index}>{line}</Copy>)}
              {c.reason && <Copy>{arenaLiveLabel(c.reason)}</Copy>}
              {c.requestId && (
                <>
                  <Action
                    label="调用与资料审计"
                    onPress={() => setAudit(audit === c.id ? '' : c.id)}
                  />
                  {audit === c.id && <Copy>{JSON.stringify(c.usage, null, 2)}</Copy>}
                </>
              )}
            </Section>
          ))}
        </>
      )}
      {tab === 'positions' && (
        <>
          {!book.positions.length && <Copy muted>当前空仓</Copy>}
          {arenaPositionTotals(book).map((p) => (
            <Copy key={p.symbol}>
              {name(p.symbol)} · 持有 {formatDecimalNumber(p.quantity)} 股 · 可卖{' '}
              {agent.availability.tradingDate === null
                ? '待确认'
                : formatDecimalNumber(agent.availability.shares[p.symbol] ?? '0')}{' '}
              · 份额可卖日期 {p.availableOn.join('、')}
            </Copy>
          ))}
        </>
      )}
      {tab === 'orders' && (
        <>
          {!book.orders.length && <Copy muted>暂无委托</Copy>}
          {[...book.orders].reverse().map((o) => (
            <Section key={o.id} title={name(o.symbol)}>
              <Copy>
                {o.side === 'buy' ? '买入' : '卖出'} · {arenaLiveLabel(o.kind)} ·{' '}
                {arenaOrderQuantityText(book, o)} · 价格 {o.price ?? '市价'}
              </Copy>
              <Copy>
                {arenaLiveLabel(o.state)} · {o.state === 'waiting_parent' && o.validUntil ? arenaProtectionValidityText(o.validUntil) : '有效至 ' + time(o.expiresAt)}
              </Copy>
              {o.parentOrderId && <Copy muted>{arenaOrderProtectionText(book, o, agent.availability.tradingDate)}</Copy>}
              {o.reason && <Copy muted>{arenaLiveLabel(o.reason)}</Copy>}
            </Section>
          ))}
        </>
      )}
      {tab === 'fills' && (
        <>
          {!book.fills.length && <Copy muted>暂无成交</Copy>}
          {[...book.fills].reverse().map((f) => (
            <Section key={f.id} title={name(f.symbol)}>
              <Copy>
                {time(f.marketTime)} · {f.side === 'buy' ? '买入' : '卖出'}{' '}
                {formatDecimalNumber(f.quantity)} 股 × {formatDecimalNumber(f.price)} · 费用{' '}
                {formatDecimalNumber(f.fee)}
              </Copy>
              <Action label="来源资料" onPress={() => setAudit(audit === f.id ? '' : f.id)} />
              {audit === f.id && <Copy>{JSON.stringify(f.evidence, null, 2)}</Copy>}
            </Section>
          ))}
        </>
      )}
    </>
  );
}
