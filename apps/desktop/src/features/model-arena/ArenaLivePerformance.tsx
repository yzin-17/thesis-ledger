import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { arenaLiveLabel, arenaNextDecisionLabel, arenaRatio, formatDecimalNumber } from '@thesis-ledger/domain';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import { ArenaLiveChart } from './ArenaLiveChart.js';
import { ArenaLiveRecentDecisions } from './ArenaLiveRecentDecisions.js';
import { ArenaSections } from './ArenaSections.js';

export function ArenaLivePerformance({
  detail: d,
  onSelect,
  onOpenDecision,
}: {
  detail: ArenaLiveDetail;
  onSelect: (agentId: string) => void;
  onOpenDecision: (agentId: string) => void;
}) {
  const latest = d.state === 'ended' ? d.sealedFrame : d.frames.at(-1);
  const rankedAgents = [...d.agents].sort(
    (a, b) =>
      (latest?.marks.find((mark) => mark.agentId === a.id)?.rank ?? 999) -
      (latest?.marks.find((mark) => mark.agentId === b.id)?.rank ?? 999),
  );

  return (
    <ArenaSections>
      <ArenaLiveChart detail={d} onSelectAgent={onSelect} />
      <div className="@container min-w-0">
        <div className="grid min-w-0 items-start gap-6 @min-[720px]:grid-cols-2">
          <ArenaLiveRecentDecisions detail={d} onOpenDecision={onOpenDecision} />
          <section className="grid min-w-0 content-start gap-3" aria-label="赛季排名">
            <div>
              <h2 className="text-xl font-semibold">赛季排名</h2>
              {latest && !latest.complete && (
                <p className="mt-1 text-xs text-muted-foreground">
                  共同估值不完整，本批次暂停排名。
                </p>
              )}
              {d.state === 'ended' && !d.sealedFrame && (
                <p className="mt-1 text-xs text-muted-foreground">
                  尚无完整共同估值，无法确定最终排名。
                </p>
              )}
            </div>
            <Table className="table-fixed">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10 px-2">排名</TableHead>
                  <TableHead className="px-2">模型</TableHead>
                  <TableHead className="w-28 px-2 text-right">收益 / 净值</TableHead>
                  <TableHead className="w-20 px-2 text-right">回撤</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rankedAgents.map((agent) => {
                  const mark = latest?.marks.find((item) => item.agentId === agent.id);
                  return (
                    <TableRow key={agent.id}>
                      <TableCell className="px-2 tabular-nums">{mark?.rank ?? '—'}</TableCell>
                      <TableCell className="min-w-0 px-2 whitespace-normal">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-auto max-w-full justify-start border-0 p-0 text-left whitespace-normal"
                          onClick={() => onSelect(agent.id)}
                        >
                          <span className="line-clamp-2 wrap-anywhere" title={agent.model}>
                            {agent.model}
                          </span>
                        </Button>
                        <p
                          className="mt-1 truncate text-xs text-muted-foreground"
                          title={agent.providerId + ' · ' + arenaLiveLabel(agent.state)}
                        >
                          {agent.providerId} · {arenaLiveLabel(agent.state)}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground wrap-anywhere">
                          下一次决策：{arenaNextDecisionLabel({
                            wakeups: agent.account?.wakeups ?? [], matchState: d.state,
                            agentState: agent.state, timeZone: d.protocol.timeZone,
                            pending: agent.cycles.some((c) => c.state === 'pending'),
                            ...(d.timeline?.phase === 'replay' ? { clockAt: d.timeline.pendingAt ?? d.timeline.cursorAt } : {}),
                          })}
                        </p>
                      </TableCell>
                      <TableCell className="px-2 text-right tabular-nums">
                        <span>
                          {mark?.returnRatio == null ? '—' : arenaRatio(mark.returnRatio)}
                        </span>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {mark?.nav == null ? '未估值' : formatDecimalNumber(mark.nav)}
                        </p>
                      </TableCell>
                      <TableCell className="px-2 text-right tabular-nums">
                        {mark?.drawdown == null ? '—' : arenaRatio(mark.drawdown)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </section>
        </div>
      </div>
    </ArenaSections>
  );
}
