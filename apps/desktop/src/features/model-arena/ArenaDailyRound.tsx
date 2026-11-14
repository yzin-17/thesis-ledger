import { ArenaDisclosure } from './ArenaDisclosure.js';
import { ArenaSections } from './ArenaSections.js';
import { Separator } from '@/components/ui/separator';
import { formatDateTime } from '@/lib/date-display';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { arenaActionLabel, arenaCostLabel, arenaStatusLabel, formatDecimalNumber } from '@thesis-ledger/domain';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { ArenaFacts, ArenaModelHeader, ArenaNotice } from './ArenaDetailShell.js';

type Report = Awaited<ReturnType<ThesisLedgerApiClient['modelArenas']['round']>>;
export function ArenaDailyRound({ report, entrant }: { report: Report; entrant: string | null }) {
  const entries = report.entries.filter((e) => !entrant || e.entrantId === entrant);
  return <div className="grid min-w-0 gap-group">
    <ArenaFacts items={[
      ['展示模型', entries.length + ' 个'],
      ['模拟成交', entries.reduce((n, e) => n + e.fills.length, 0) + ' 笔'], ['冻结资料', report.facts.length + ' 条'],
    ]} />
    <Separator />
    {!entries.length && <ArenaNotice title={entrant ? '所选模型在此日期没有记录' : '该轮没有模型决策'}>已冻结的轮次资料保留在审计信息中，可选择其他日期或模型继续查看。</ArenaNotice>}
    <ArenaSections>
    {entries.map((e) => <article id={'model-' + e.entrantId} key={e.entrantId} aria-labelledby={'model-title-' + e.entrantId} className="grid min-w-0 gap-6">
      <ArenaModelHeader model={e.model} provider={e.providerId} titleId={'model-title-' + e.entrantId} actions={<span className="rounded-md bg-background px-2 py-1 text-xs">{arenaStatusLabel(e.state)}</span>} />
      <div className="grid min-w-0 gap-6 px-4">
        <section className="grid min-w-0 gap-4"><h3 className="text-sm font-semibold">模型决策</h3>
          {!e.decision?.actions.length && <p className="text-sm text-muted-foreground">本轮未记录交易决策。</p>}
          {e.decision?.actions.map((a) => <section key={a.symbol} className="grid min-w-0 gap-3 rounded-lg bg-muted/30 p-4">
            <h3 className="text-sm font-semibold">{a.symbol} · {arenaActionLabel(a)}</h3><p className="text-sm leading-relaxed whitespace-pre-wrap wrap-anywhere">{a.reason}</p>
            <p className="text-xs leading-relaxed text-muted-foreground wrap-anywhere">失效条件：{a.invalidatedBy}</p>
            {a.references.length > 0 && <ArenaDisclosure title={`依据资料 · ${a.references.length} 条`} className=""><ul className="mt-3 grid gap-3 text-xs text-muted-foreground">{a.references.map((ref) => {
              const fact = report.facts.find((f) => f.ref === ref);
              return <li key={ref} className="wrap-anywhere">{fact ? <>{fact.symbol} · {fact.date} · {fact.kind === 'daily_bar' ? '收盘 ' + fact.close : fact.title}</> : '未找到对应冻结资料 · ' + ref}</li>;
            })}</ul></ArenaDisclosure>}
          </section>)}
        </section>
        <section className="grid min-w-0 gap-3"><h3 className="text-sm font-semibold">模拟成交 · {e.fills.length}</h3>
          {!e.fills.length ? <p className="text-sm text-muted-foreground">本轮暂无模拟成交。</p> : <Table><TableHeader><TableRow>{['成交时间', '标的', '方向', '数量', '价格', '费用'].map((s) => <TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{e.fills.map((f, i) => <TableRow key={i}><TableCell>{formatDateTime(f.executedAt)}</TableCell><TableCell>{f.symbol}</TableCell><TableCell>{f.side === 'buy' ? '买入' : '卖出'}</TableCell><TableCell className="text-right tabular-nums">{formatDecimalNumber(f.quantity)}</TableCell><TableCell className="text-right tabular-nums">{formatDecimalNumber(f.price)}</TableCell><TableCell className="text-right tabular-nums">{formatDecimalNumber(f.fee)}</TableCell></TableRow>)}</TableBody></Table>}
        </section>
        <ArenaDisclosure title="调用与执行资料"><div className="grid min-w-0 gap-4">
          <ArenaFacts items={[
            ['模型费用', arenaCostLabel(e)], ['实际模型', e.actualModel ?? '未记录'], ['接收时间', formatDateTime(e.receivedAt, '未记录')], ['执行时间', formatDateTime(e.executionAt, '未执行')],
          ]} />
          {e.requestId && <p className="text-xs text-muted-foreground wrap-anywhere">请求编号：{e.requestId}</p>}
          {Object.entries(e.executionReasons).map(([symbol, reason]) => <p key={symbol} className="text-sm">{symbol} · {arenaStatusLabel(reason)}</p>)}
          <pre className="mt-3 max-h-80 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">{JSON.stringify({ book: e.book, fills: e.fills, settledAt: e.settledAt }, null, 2)}</pre>
        </div></ArenaDisclosure>
      </div>
    </article>)}
    <ArenaDisclosure title="轮次冻结资料与审计"><pre className="mt-4 max-h-96 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">{JSON.stringify({ asOf: report.asOf, fingerprint: report.fingerprint, closeMarks: report.closeMarks, facts: report.facts }, null, 2)}</pre></ArenaDisclosure>
    </ArenaSections>
  </div>;
}
