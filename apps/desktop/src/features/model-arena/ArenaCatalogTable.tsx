import { Link } from 'react-router';
import type { ArenaCatalogItem } from '@thesis-ledger/schemas';
import { arenaLiveLabel, arenaStatusLabel, arenaSeasonLabel } from '@thesis-ledger/domain';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';

export function ArenaCatalogTable({ items, returnPath }: { items: ArenaCatalogItem[]; returnPath: string }) {
  return <Table aria-label="比赛列表">
    <TableHeader><TableRow>
      <TableHead>比赛</TableHead><TableHead>类型</TableHead><TableHead>市场</TableHead>
      <TableHead>赛期</TableHead><TableHead className="text-right">模型</TableHead><TableHead>状态</TableHead>
    </TableRow></TableHeader>
    <TableBody>{items.map((match) => {
      const path = match.kind === 'live' ? '/arena/' : '/arena/history/';
      return <TableRow key={path + match.id}>
        <TableCell><Link to={path + match.id} state={{ arenaReturn: returnPath }} className="block min-w-40 max-w-72 whitespace-normal wrap-anywhere font-medium hover:underline focus-visible:outline-ring">{match.title}</Link></TableCell>
        <TableCell>{match.kind === 'live' ? '自主比赛' : '日频比赛'}</TableCell>
        <TableCell>{{ CN: 'A股', HK: '港股', US: '美股' }[match.market]}</TableCell>
        <TableCell className="tabular-nums">{match.startsOn && match.endsOn ? <><span className="block">{match.startsOn}</span><span className="block text-xs text-muted-foreground">至 {match.endsOn}</span></> : arenaSeasonLabel(match)}</TableCell>
        <TableCell className="text-right tabular-nums">{match.models.length}</TableCell>
        <TableCell>{match.kind === 'live' ? arenaLiveLabel(match.state) : arenaStatusLabel(match.state)}</TableCell>
      </TableRow>;
    })}</TableBody>
  </Table>;
}
