import { ArenaDisclosure } from './ArenaDisclosure.js';
import { ArenaSections } from './ArenaSections.js';
import { Separator } from '@/components/ui/separator';
import type { ReactNode } from 'react';
import type { ArenaDailyView } from './arena-daily-navigation.js';
import { Link } from 'react-router';
import type { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import type { ArenaComparison } from '@thesis-ledger/schemas';
import { arenaRatio, formatDecimalNumber } from '@thesis-ledger/domain';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { ArenaDateRange, ArenaFacts, ArenaModelHeader, ArenaNotice } from './ArenaDetailShell.js';

type Detail = Awaited<ReturnType<ThesisLedgerApiClient['modelArenas']['get']>>;
export function ArenaDailyMatch({ detail: d, comparison, comparisonError, retryComparison, view, onViewChange, onOpenLatest, activity }: {
  detail: Detail; comparison: ArenaComparison | undefined; comparisonError: boolean; retryComparison: () => void; view: ArenaDailyView; onViewChange: (view: ArenaDailyView) => void; onOpenLatest: (modelId: string) => void; activity: ReactNode;
}) {
  const hasValues = comparison?.rows.some((r) => r.metrics.endNav !== null || r.metrics.returnRatio !== null);
  return <Tabs value={view} onValueChange={(next) => onViewChange(next as ArenaDailyView)} className="min-w-0">
    <TabsList variant="line" aria-label="比赛详情">{[['performance', '收益表现'], ['accounts', '模型账户'], ['activity', '决策与成交'], ['settings', '比赛设置']].map(([value, label]) => <TabsTrigger key={value} value={value!}>{label}</TabsTrigger>)}</TabsList>
    <TabsContent value="performance" className="grid min-w-0 gap-group">
      <ArenaFacts items={[
        ['每模型初始本金', formatDecimalNumber(d.protocol.initialCash) + ' ' + d.protocol.currency],
        ['参赛模型', d.entrants.length + ' 个'],
        ['比较区间', <ArenaDateRange start={comparison?.start ?? d.protocol.startsOn} end={comparison?.end ?? d.protocol.endsOn} />],
        ['最近轮次记录', d.rounds[0]?.tradingDate ?? '尚无记录'],
      ]} />
      {(comparison || comparisonError) && <Separator />}
      {comparisonError && <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>收益资料读取失败，账户与决策记录仍可查看。</p><Button variant="outline" size="sm" onClick={retryComparison}>重新读取收益</Button></div>}
      {comparison && !hasValues && <ArenaNotice title="尚无可比较的净值记录" action={<div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => onViewChange('activity')}>查看决策与成交</Button><Button variant="outline" size="sm" onClick={() => onViewChange('accounts')}>查看模型账户</Button></div>}>
        本区间尚不能计算收益和排名。已保存的模型决策、模拟成交与现金余额可在对应记录中查看。
      </ArenaNotice>}
      {comparison && hasValues && <section className="grid min-w-0 gap-3"><div><h2 className="text-xl font-semibold">模型与基准表现</h2><p className="mt-1 text-xs text-muted-foreground">金额单位：{comparison.currency}。— 表示本区间缺少可计算的净值记录。</p></div>
        <Table><TableHeader><TableRow>{['模型或基准', '排名', '收盘净值', '收益', '最大回撤', '换手', '交易费'].map((s, i) => <TableHead key={s} className={i ? 'text-right' : ''}>{s}</TableHead>)}</TableRow></TableHeader><TableBody>{comparison.rows.map((r) => <TableRow key={r.id}>
          <TableCell className="min-w-48 max-w-80 whitespace-normal wrap-anywhere">{r.label}</TableCell><TableCell className="text-right tabular-nums">{r.rank ?? '—'}</TableCell>
          <TableCell className="text-right tabular-nums">{r.metrics.endNav === null ? '—' : formatDecimalNumber(r.metrics.endNav)}</TableCell>
          {[r.metrics.returnRatio, r.metrics.drawdown, r.metrics.turnover].map((value, i) => <TableCell key={i} className="text-right tabular-nums">{value === null ? '—' : arenaRatio(value)}</TableCell>)}
          <TableCell className="text-right tabular-nums">{r.metrics.tradeFees === null ? '—' : formatDecimalNumber(r.metrics.tradeFees)}</TableCell>
        </TableRow>)}</TableBody></Table>
      </section>}
    </TabsContent>
    <TabsContent value="accounts" className="grid min-w-0 gap-6">
      <p className="text-xs text-muted-foreground">现金余额不包含持仓市值。收益以“收益表现”中的净值记录为准。</p>
      <ArenaSections>
      {d.entrants.map((e) => <section key={e.id} className="grid min-w-0 gap-4 py-2">
        <ArenaModelHeader model={e.model} provider={e.providerId} />
        <ArenaFacts items={[
          ['模拟现金', formatDecimalNumber(e.cash) + ' ' + d.protocol.currency], ['剩余请求', e.remaining.requests + ' 次'],
          ['剩余令牌', e.remaining.tokens], ['剩余模型费用', e.remaining.costMicros / 1000000 + ' ' + d.protocol.budgetCurrency],
        ]} />
        {comparison?.rows.find((r) => r.id === e.id)?.metrics.tradeFees != null && <p className="text-xs text-muted-foreground">区间交易费 {comparison.rows.find((r) => r.id === e.id)!.metrics.tradeFees} {d.protocol.currency}</p>}
        {d.rounds[0] && <Button variant="outline" size="sm" className="w-fit" onClick={() => onOpenLatest(e.id)}>查看最近决策</Button>}
      </section>)}
      </ArenaSections>
    </TabsContent>
    <TabsContent value="activity">{activity}</TabsContent>
    <TabsContent value="settings"><ArenaSections>
      <section className="grid gap-4"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">模型调用额度</h2><Link to={'/journal/model-weeklies/' + d.id} className={buttonVariants({ variant: 'outline', size: 'sm' })}>模型周报</Link></div><ArenaFacts items={[
        ['总请求额度', d.protocol.budget.requests + ' 次'], ['剩余请求', d.remaining.requests + ' 次'],
        ['令牌总额度', d.protocol.budget.tokens], ['剩余令牌', d.remaining.tokens],
        ['模型费用总额度', d.protocol.budget.costMicros / 1000000 + ' ' + d.protocol.budgetCurrency], ['剩余模型费用', d.remaining.costMicros / 1000000 + ' ' + d.protocol.budgetCurrency],
      ]} /></section>
      <section className="grid gap-5"><h2 className="text-xl font-semibold">冻结赛制</h2><ArenaFacts items={[
        ['赛期', <ArenaDateRange start={d.protocol.startsOn} end={d.protocol.endsOn} />], ['模拟资金币种', d.protocol.currency], ['单标的仓位上限', d.protocol.maxPositionBps / 100 + '%'], ['决策截止', d.protocol.decisionDeadlineMinutes + ' 分钟'],
        ['买入费率', d.protocol.fees.buyBps + ' 基点'], ['卖出费率', d.protocol.fees.sellBps + ' 基点'], ['最低交易费', d.protocol.fees.minimum], ['滑点', d.protocol.fees.slippageBps + ' 基点'],
      ]} /><p className="text-xs text-muted-foreground wrap-anywhere">参赛标的：{d.protocol.instruments.map((i) => i.symbol).join('、')}</p></section>
      <ArenaDisclosure title="查看完整冻结协议"><pre className="mt-4 max-h-96 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">{JSON.stringify(d.protocol, null, 2)}</pre></ArenaDisclosure>
      {comparison && <ArenaDisclosure title="查看区间比较资料"><pre className="mt-4 max-h-96 overflow-auto text-xs whitespace-pre-wrap wrap-anywhere">{JSON.stringify(comparison, null, 2)}</pre></ArenaDisclosure>}
    </ArenaSections></TabsContent>
  </Tabs>;
}
