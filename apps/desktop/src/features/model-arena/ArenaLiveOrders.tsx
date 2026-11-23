import { arenaLiveLabel, arenaMatchingText, arenaOrderProtectionText, arenaOrderQuantityText, arenaProtectionValidityText, formatDecimalNumber } from '@thesis-ledger/domain';
import type { ArenaLiveDetail } from '@thesis-ledger/schemas';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { EmptyTableRow } from '../shared/EmptyStates';

export function ArenaLiveOrders({ book, day, name, time, matching }: {
  book: ArenaLiveDetail['agents'][number]['account']; day: string | null;
  name: (symbol: string) => string; time: (at: string) => string;
  matching?: ArenaLiveDetail['protocol']['matching'];
}) {
  return <><p className="mb-4 text-sm text-muted-foreground">{arenaMatchingText(matching)}</p><Table aria-label="委托列表">
    <TableHeader><TableRow>{['标的', '方向与类型', '数量', '价格／触发价', '状态与保护', '有效至'].map((s) => <TableHead key={s}>{s}</TableHead>)}</TableRow></TableHeader>
    <TableBody>{[...book.orders].reverse().map((o) => <TableRow key={o.id}>
      <TableCell>{name(o.symbol)}</TableCell>
      <TableCell>{o.side === 'buy' ? '买入' : '卖出'} · {arenaLiveLabel(o.kind)}</TableCell>
      <TableCell className="min-w-40 whitespace-normal text-right tabular-nums">{arenaOrderQuantityText(book, o)}</TableCell>
      <TableCell className="text-right tabular-nums">{o.price ? formatDecimalNumber(o.price) : '市价'}</TableCell>
      <TableCell className="min-w-48 max-w-sm whitespace-normal wrap-anywhere">
        {arenaLiveLabel(o.state)}{o.reason && ' · ' + arenaLiveLabel(o.reason)}
        {o.parentOrderId && <p className="text-xs text-muted-foreground">{arenaOrderProtectionText(book, o, day)}</p>}
      </TableCell>
      <TableCell>{o.state === 'waiting_parent' && o.validUntil ? arenaProtectionValidityText(o.validUntil) : time(o.expiresAt)}</TableCell>
    </TableRow>)}{!book.orders.length && <EmptyTableRow colSpan={6} label="暂无委托" />}</TableBody>
  </Table></>;
}
