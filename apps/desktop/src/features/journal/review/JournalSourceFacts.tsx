import type { JournalReviewEvidenceInput } from '@thesis-ledger/schemas';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export function JournalSourceFacts({ input }: { input: JournalReviewEvidenceInput }) {
  const reference = input.reference;
  const slices =
    reference.reviewObjectType === 'CLOSE_SLICE'
      ? input.trade.closeSlices.filter((row) => row.id === reference.closeSliceId)
      : input.trade.closeSlices;
  const hasAllocatedFact = (factId: string) =>
    reference.reviewObjectType === 'TRADE_CYCLE' ||
    slices.some((slice) =>
      slice.allocations.some((allocation) => allocation.sourceFactId === factId),
    );
  const entries = input.trade.entryLegs.filter((row) => hasAllocatedFact(row.factId));
  const baselines = input.trade.baselineComponents.filter((row) => hasAllocatedFact(row.factId));
  const charges = (rows: Array<{ amount: string; currency: string }>) =>
    rows.map((row) => `${row.amount} ${row.currency}`).join(' + ') || '无费用记录';
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">真实退出成交</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>数量</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>费用</TableHead>
              <TableHead>净收益</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {slices.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.occurredAt ?? '未知'}</TableCell>
                <TableCell className="font-mono">{row.quantity}</TableCell>
                <TableCell className="font-mono">
                  {row.price ?? '未知'} {row.currency}
                </TableCell>
                <TableCell className="whitespace-normal">{charges(row.charges)}</TableCell>
                <TableCell className="font-mono">
                  {row.netRealizedPnl ?? '证据不足'} {row.currency}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {slices.length === 0 && <p className="text-sm text-muted-foreground">没有实际卖出成交。</p>}
      </div>
      <div>
        <h3 className="text-sm font-medium">入场成交来源</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>原始数量</TableHead>
              <TableHead>价格</TableHead>
              <TableHead>费用</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.occurredAt ?? '未知'}</TableCell>
                <TableCell className="font-mono">{row.originalQuantity}</TableCell>
                <TableCell className="font-mono">
                  {row.price ?? '未知'} {row.currency}
                </TableCell>
                <TableCell className="whitespace-normal">{charges(row.charges)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {baselines.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">基线观察（不是成交）</h3>
          {baselines.map((row) => (
            <p className="break-all text-sm" key={row.id}>
              观察时间：{row.occurredAt ?? '未知'}；数量：{row.observedQuantity}；参考成本：
              {row.averageCost ?? '未知'} {row.currency}；
              {row.rawCostEstimated ? '估算成本' : '已有成本证据'}
            </p>
          ))}
        </div>
      )}
      <div>
        <h3 className="text-sm font-medium">原始计划</h3>
        {input.plan ? (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt>计划入场价</dt>
              <dd className="font-mono">{input.plan.plannedEntry ?? '未提供'}</dd>
            </div>
            <div>
              <dt>计划退出价</dt>
              <dd className="font-mono">{input.plan.plannedExit ?? '未提供'}</dd>
            </div>
            <div>
              <dt>计划止损价</dt>
              <dd className="font-mono">{input.plan.stopLoss ?? '未提供'}</dd>
            </div>
            <div>
              <dt>计划持有天数</dt>
              <dd>{input.plan.expectedHoldingDays ?? '未提供'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt>计划说明</dt>
              <dd>{input.plan.thesis ?? input.plan.reason ?? '未提供'}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-muted-foreground">没有明确关联的计划。</p>
        )}
      </div>
      {input.journalEntries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium">关联 Journal 说明</h3>
          {input.journalEntries.map((row) => (
            <p className="text-sm" key={row.id}>
              {row.createdAt} · {row.content ?? row.notes ?? row.reason}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
