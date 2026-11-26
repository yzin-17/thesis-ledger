import { useState } from 'react';
import {
  arenaAppointmentLabel,
  arenaHasDueTimeWakeup,
  arenaManualDecisionNotice,
  arenaNextDecisionNote,
  arenaPositionTotals,
  arenaLiveLabel,
  arenaBudgetCountLabel,
  arenaBudgetCostLabel,
  formatDecimalNumber,
} from '@thesis-ledger/domain';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { formatDateTimeWithLocalZone } from '@/lib/date-display';
import { ArenaFacts, ArenaModelHeader } from './ArenaDetailShell.js';
import { ArenaSections } from './ArenaSections.js';
import { ArenaDisclosure } from './ArenaDisclosure.js';
import { EmptyTableRow } from '../shared/EmptyStates.js';
import { ArenaLiveOrders } from './ArenaLiveOrders.js';

type ArenaLiveAgentProps = {
  detail: ArenaLiveDetail;
  agentId: string;
  onRetry: () => void;
  busy: boolean;
  onHistory: () => void;
  onTrigger?: () => void;
  triggerBusy?: boolean;
  triggerAppointment?: 'scheduled' | 'already_scheduled' | 'already_in_progress' | null;
  triggerError?: unknown;
};
export function ArenaLiveAgent(props: ArenaLiveAgentProps) {
  const { detail, agentId } = props;
  const [tab, setTab] = useState('research');
  const agent = detail.agents.find((a) => a.id === agentId);
  if (!agent) return null;
  return <ArenaLiveAgentContent {...props} agent={agent} tab={tab} setTab={setTab} />;
}

function ArenaLiveAgentContent(
  props: ArenaLiveAgentProps & {
    agent: ArenaLiveDetail['agents'][number];
    tab: string;
    setTab: (value: string) => void;
  },
) {
  const control = arenaLiveAgentMaterials(props);
  const {
    agent,
    detail,
    canTrigger,
    onTrigger,
    triggerBusy,
    triggerNotice,
    triggerError,
    book,
    binding,
    tab,
    setTab,
    time,
    name,
  } = control;

  return (
    <section className="grid min-w-0 gap-6" id={'model-' + agent.id}>
      <LiveAgentHeader control={control} />
      {triggerBusy && (
        <p role="status" className="text-sm text-muted-foreground">
          正在提交决策预约…
        </p>
      )}
      {triggerNotice && (
        <p role="status" className="text-sm text-foreground">
          {triggerNotice}
        </p>
      )}
      {agent.state === 'waiting' && triggerError != null && (
        <p role="alert" className="text-sm text-destructive">
          预约失败：{triggerError instanceof Error ? triggerError.message : '请重试'}
        </p>
      )}
      <ArenaFacts
        items={[
          ['模拟现金', formatDecimalNumber(book.cash) + ' ' + detail.protocol.currency],
          [
            '可用现金',
            agent.availability.cash === null
              ? '待确认'
              : formatDecimalNumber(agent.availability.cash),
          ],
          ['剩余请求', arenaBudgetCountLabel(agent.remaining.requests, ' 次')],
          [
            '剩余模型费用',
            arenaBudgetCostLabel(agent.remaining.costMicros, detail.protocol.budgetCurrency),
          ],
          ['单次输入上限', arenaBudgetCountLabel(binding.maxInputTokens)],
          ['单次输出上限', arenaBudgetCountLabel(binding.maxOutputTokens)],
        ]}
      />
      {agent.reason && (
        <p className="text-sm text-muted-foreground">{arenaLiveLabel(agent.reason)}</p>
      )}
      {canTrigger && onTrigger && (
        <p className="text-xs text-muted-foreground">
          手动触发会消耗模型额度；盘前、盘后和休市可以研究，新委托与成交仍需开市。
        </p>
      )}
      <Tabs value={tab} onValueChange={setTab} className="min-w-0">
        <TabsList variant="line" aria-label="模型账户详情">
          {[
            ['research', '研究与预约'],
            ['positions', '持仓'],
            ['orders', '委托'],
            ['fills', '成交'],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value!}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        <LiveAgentResearch control={control} />
        <TabsContent value="positions" className="min-w-0">
          <Table aria-label="持仓列表">
            <TableHeader>
              <TableRow>
                {['标的', '持有数量', '当前可卖', '可卖日期'].map((s) => (
                  <TableHead key={s}>{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {arenaPositionTotals(book).map((p) => (
                <TableRow key={p.symbol}>
                  <TableCell>{name(p.symbol)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimalNumber(p.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {agent.availability.tradingDate === null
                      ? '待确认'
                      : formatDecimalNumber(agent.availability.shares[p.symbol] ?? '0')}
                  </TableCell>
                  <TableCell>{p.availableOn.join('、')}</TableCell>
                </TableRow>
              ))}
              {!book.positions.length && <EmptyTableRow colSpan={4} label="当前空仓" />}
            </TableBody>
          </Table>
        </TabsContent>
        <TabsContent value="orders" className="min-w-0">
          <ArenaLiveOrders book={book} day={agent.availability.tradingDate} name={name} time={time} matching={detail.protocol.matching} />
        </TabsContent>
        <TabsContent value="fills" className="min-w-0">
          <Table aria-label="成交列表">
            <TableHeader>
              <TableRow>
                {['行情时间', '标的', '方向', '数量', '成交价', '费用', '证据'].map((s) => (
                  <TableHead key={s}>{s}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...book.fills].reverse().map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{time(f.marketTime)}</TableCell>
                  <TableCell>{name(f.symbol)}</TableCell>
                  <TableCell>{f.side === 'buy' ? '买入' : '卖出'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimalNumber(f.quantity)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimalNumber(f.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatDecimalNumber(f.fee)}
                  </TableCell>
                  <TableCell>
                    <ArenaDisclosure title="来源资料">
                      <pre className="max-h-56 max-w-sm overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">
                        {JSON.stringify(f.evidence, null, 2)}
                      </pre>
                    </ArenaDisclosure>
                  </TableCell>
                </TableRow>
              ))}
              {!book.fills.length && <EmptyTableRow colSpan={7} label="暂无成交" />}
            </TableBody>
          </Table>
        </TabsContent>
      </Tabs>
    </section>
  );
}

function arenaLiveAgentMaterials({
  detail,
  onRetry,
  busy,
  onHistory,
  onTrigger,
  triggerBusy = false,
  triggerAppointment,
  triggerError,
  agent,
  tab,
  setTab,
}: ArenaLiveAgentProps & {
  agent: ArenaLiveDetail['agents'][number];
  tab: string;
  setTab: (value: string) => void;
}) {
  const binding = detail.protocol.entrants.find(
    (e) => e.providerId === agent.providerId && e.model === agent.model,
  )!;
  const book = agent.account,
    zone = detail.protocol.timeZone;
  const name = (symbol: string) =>
    detail.instrumentDirectory[symbol]
      ? detail.instrumentDirectory[symbol] + ' · ' + symbol
      : symbol;
  const time = (at: string) => formatDateTimeWithLocalZone(at);
  const clockAt =
    detail.timeline?.phase === 'replay'
      ? (detail.timeline.pendingAt ?? detail.timeline.cursorAt)
      : new Date().toISOString();
  const awaitingObservation = arenaHasDueTimeWakeup(book.wakeups, clockAt);
  const canTrigger =
    detail.state === 'running' &&
    agent.state === 'waiting' &&
    !awaitingObservation &&
    !agent.cycles.some((cycle) => cycle.state === 'pending' || cycle.state === 'running') &&
    (detail.timeline?.phase !== 'replay' ||
      (detail.timeline.status === 'ready' && !detail.timeline.pendingAt)) &&
    agent.remaining.requests !== 0 &&
    detail.remaining.requests !== 0;
  const appointments = book.wakeups.filter((w) => !w.firedAt);
  const nextDecisionNote = arenaNextDecisionNote({
    wakeups: book.wakeups,
    matchState: detail.state,
    agentState: agent.state,
    timeZone: zone,
    pending: agent.cycles.some((c) => c.state === 'pending'),
    clockAt,
  });
  const eventMayFireEarlier =
    appointments.some((w) => w.condition.kind === 'time') &&
    appointments.some((w) => w.condition.kind !== 'time');
  const triggerNotice = triggerAppointment
    ? arenaManualDecisionNotice(triggerAppointment, agent.reason)
    : null;

  return {
    agent,
    detail,
    busy,
    onRetry,
    onHistory,
    canTrigger,
    onTrigger,
    triggerBusy,
    triggerNotice,
    triggerError,
    book,
    binding,
    tab,
    setTab,
    appointments,
    time,
    name,
    nextDecisionNote,
    eventMayFireEarlier,
  };
}

function LiveAgentHeader({ control }: { control: ReturnType<typeof arenaLiveAgentMaterials> }) {
  return (
    <>
      <ArenaModelHeader
        model={control.agent.model}
        provider={control.agent.providerId}
        actions={
          <>
            {control.agent.state === 'needs_attention' && control.detail.state === 'running' && (
              <Button variant="outline" disabled={control.busy} onClick={control.onRetry}>
                重新预约研究
              </Button>
            )}
            <Button variant="outline" onClick={control.onHistory}>
              查看历史决策
            </Button>
            {control.canTrigger && control.onTrigger && (
              <Button
                variant="outline"
                disabled={control.triggerBusy}
                aria-busy={control.triggerBusy}
                onClick={control.onTrigger}
              >
                {control.triggerBusy ? '正在提交预约…' : '手动触发决策'}
              </Button>
            )}
          </>
        }
      />
    </>
  );
}
function LiveAgentResearch({ control }: { control: ReturnType<typeof arenaLiveAgentMaterials> }) {
  return (
    <>
      <TabsContent value="research">
        <ArenaSections>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">下一次决策</h3>
            {control.appointments.map((w) => (
              <p key={w.id} className="text-sm">
                {w.condition.kind === 'time'
                  ? '预约时间 · ' + control.time(w.condition.at)
                  : arenaAppointmentLabel(w.condition, control.name)}
              </p>
            ))}
            {!control.appointments.length && (
              <p className="text-sm text-muted-foreground">
                {control.agent.state === 'researching'
                  ? '正在研究，完成后更新观察预约'
                  : (control.nextDecisionNote ?? '尚无待触发的观察预约')}
              </p>
            )}
            {!!control.appointments.length && control.nextDecisionNote && (
              <p className="text-sm text-muted-foreground">{control.nextDecisionNote}</p>
            )}
            {control.eventMayFireEarlier && (
              <p className="text-xs text-muted-foreground">价格与成交事件可能早于预约时间触发</p>
            )}
          </div>
        </ArenaSections>
      </TabsContent>
    </>
  );
}
