import { Link } from 'react-router';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { arenaObservationLabel, arenaCostLabel, arenaRatio, arenaStatusLabel, formatDecimalNumber } from '@thesis-ledger/domain';
import { buttonVariants } from '@/components/ui/button';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { formatDateTimeInTimeZone, formatDateOnly } from '@/lib/date-display';
import { StickyTableActionHeader, StickyTableActionCell } from '../shared/StickyTableActions.js';
import { ArenaSections } from './ArenaSections.js';
import { ArenaDisclosure } from './ArenaDisclosure.js';
import { ArenaDateRange, ArenaFacts } from './ArenaDetailShell.js';

type Report = Awaited<ReturnType<ThesisLedgerApiClient['modelArenas']['weekly']>>['report'];
const amount = (value: string | null) => value === null ? '—' : formatDecimalNumber(value);
const entryLink = buttonVariants({ variant: 'outline', size: 'sm', className: 'h-auto w-fit max-w-full justify-start text-left whitespace-normal wrap-anywhere' });
export function ArenaWeekReport({ report: r, arenaId, back }: { report: Report; arenaId: string; back: { arenaReturn: string } }) {
  const record = (round: string, model?: string) => '/arena/history/' + arenaId + '?view=activity&round=' + round + (model ? '&model=' + model : '');
  return <ArenaSections>
    <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">收益表现</h2>
      <ArenaFacts items={[["比较区间", <ArenaDateRange start={r.comparison.start} end={r.comparison.end} />], ["已开轮次", r.comparison.opened + ' / ' + r.comparison.planned], ["金额币种", r.comparison.currency]]} />
      <p className="text-xs text-muted-foreground">— 表示缺少可计算资料。决策覆盖为已记录决策数与已开轮次数之比。</p>
      <Table><TableHeader><TableRow>{['模型或基准', '期初净值', '期末净值', '收益', '最大回撤', '换手', '交易费', '决策覆盖'].map((s, i) => <TableHead key={s} className={i ? 'text-right' : ''}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>
        {r.comparison.rows.map((row) => <TableRow key={row.id}><TableCell className="min-w-48 max-w-80 whitespace-normal wrap-anywhere">{row.label}</TableCell>
          {[row.metrics.startNav, row.metrics.endNav].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{amount(v)}</TableCell>)}
          {[row.metrics.returnRatio, row.metrics.drawdown, row.metrics.turnover].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{arenaRatio(v)}</TableCell>)}
          <TableCell className="text-right tabular-nums">{amount(row.metrics.tradeFees)}</TableCell><TableCell className="text-right tabular-nums">{row.kind === 'model' && r.comparison.opened ? row.decisions + '/' + r.comparison.opened : '—'}</TableCell>
        </TableRow>)}
      </TableBody></Table>
    </section>
    <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">盈亏贡献</h2>
      {!r.attribution.length && <p className="text-sm text-muted-foreground">本周暂无可归属的盈亏资料。</p>}
      {r.attribution.map((a) => <div key={a.entrantId} className="grid min-w-0 gap-2 text-sm"><h3 className="font-medium wrap-anywhere">{r.comparison.rows.find((row) => row.id === a.entrantId)?.label ?? '未记录模型名称'}</h3>
        <p className="wrap-anywhere">{a.symbols.map((s) => s.symbol + ' ' + amount(s.amount)).join('，') || '暂无标的贡献'} · 费用 {amount(a.fees)} · 未归属 {amount(a.residual)}</p>
      </div>)}
    </section>
    <section className="grid min-w-0 gap-3"><h2 className="text-xl font-semibold">同轮仓位分歧</h2>
      {!r.divergences.length && <p className="text-sm text-muted-foreground">本周无可比较的仓位分歧。</p>}
      {r.divergences.map((d) => <Link key={d.roundId + d.symbol} state={back} to={record(d.roundId)} className={entryLink}>{d.day} · {d.symbol} · 仓位相差 {Number(d.spreadBps) / 100} 个百分点</Link>)}
    </section>
    <ArenaDisclosure title={'决策后的价格观察 · ' + r.observations.length + ' 条'}>
      <div className="grid gap-3 text-sm">{!r.observations.length && <p className="text-muted-foreground">暂无价格观察记录。</p>}{r.observations.map((o) => <p key={o.roundId + o.symbol + o.window} className="wrap-anywhere">{o.day} · {o.symbol} · {o.window} 个交易日 · {arenaObservationLabel(o)}</p>)}</div>
    </ArenaDisclosure>
    {r.laterNews.length > 0 && <ArenaDisclosure title="决策后收录的标的资讯"><div className="grid gap-3 text-sm">{r.laterNews.map((n) => <p key={n.roundId + n.ref} className="wrap-anywhere">{formatDateOnly(n.publishedAt)} · {n.symbol} · {n.title}</p>)}</div></ArenaDisclosure>}
    <section className="grid min-w-0 gap-4"><h2 className="text-xl font-semibold">本周决策</h2>
      {!r.rounds.length && <p className="text-sm text-muted-foreground">本周暂无决策记录。</p>}
      {r.rounds.map((round) => <div key={round.id} className="grid min-w-0 justify-items-start gap-2"><Link state={back} to={record(round.id)} className={entryLink}>{round.day} · {arenaStatusLabel(round.state)}{round.reason && ' · ' + arenaStatusLabel(round.reason)}</Link>
        {round.entries.map((e) => <Link key={e.entrantId} state={back} to={record(round.id, e.entrantId)} className={entryLink}>{e.model} · {arenaStatusLabel(e.state)} · 模型费用 {arenaCostLabel(e)}</Link>)}
      </div>)}
    </section>
    <section className="grid min-w-0 gap-3"><h2 className="text-xl font-semibold">本周模拟成交</h2>
      {!r.fills.length ? <p className="text-sm text-muted-foreground">本周无模拟成交。</p> : <Table><TableHeader><TableRow>{['成交时间', '标的', '方向', '数量', '价格', '费用'].map((s, i) => <TableHead key={s} className={i >= 3 && i <= 5 ? 'text-right' : ''}>{s}</TableHead>)}<StickyTableActionHeader>记录</StickyTableActionHeader></TableRow></TableHeader><TableBody>
        {r.fills.map((f) => <TableRow key={f.id}><TableCell>{formatDateTimeInTimeZone(f.executedAt, r.timeZone)}</TableCell><TableCell>{f.symbol}</TableCell><TableCell>{f.side === 'buy' ? '买入' : '卖出'}</TableCell>
          {[f.quantity, f.price, f.fee].map((v, i) => <TableCell key={i} className="text-right tabular-nums">{amount(v)}</TableCell>)}
          <StickyTableActionCell><Link state={back} to={record(f.roundId, f.entrantId)} className={entryLink}>查看决策</Link></StickyTableActionCell>
        </TableRow>)}
      </TableBody></Table>}
    </section>
  </ArenaSections>;
}
