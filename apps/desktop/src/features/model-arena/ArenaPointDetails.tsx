import { ChevronDown } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '@/components/ui/popover';
import type { ArenaPriceData } from './useArenaPriceData.js';

export function ArenaPointDetails({ data }: { data: ArenaPriceData }) {
  const origin = useLocation();
  const points = data.markers.filter(point => !data.state.day || point.key === data.state.day);
  return (
    <Popover>
      <PopoverTrigger render={<Button type="button" size="sm" variant="outline" />} data-arena-point-details>
        模拟成交 {points.length} 笔 · 查看明细<ChevronDown aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 max-w-[calc(100vw-2rem)] gap-3 overflow-hidden shadow-none">
        <PopoverHeader className="shrink-0">
          <div className="flex items-center justify-between gap-2">
            <PopoverTitle>模拟成交（{points.length} 笔）</PopoverTitle>
            {data.state.day && <Button type="button" size="sm" variant="outline" onClick={() => data.selectDay(null)}>查看全部</Button>}
          </div>
          {data.state.day && <p className="text-xs text-muted-foreground">所选图表日期：{data.state.day}</p>}
        </PopoverHeader>
        <ul className="min-h-0 max-h-72 overflow-y-auto overscroll-contain" aria-label="模拟成交记录">
          {points.map(point => <li key={point.id}>
            <Link className="block rounded-sm px-2 py-2 text-sm break-words hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              title={point.model}
              aria-label={`${point.day} · ${point.model} · 模拟${point.side === 'buy' ? '买入' : '卖出'} ${point.quantity} 股 × ${point.price}，查看模型记录`}
              state={{ arenaReturn: origin.pathname + origin.search }}
              to={point.roundId === null ? '/arena/' + point.arenaId + '#model-' + point.entrantId : '/strategy/arena/' + point.arenaId + '/' + point.roundId + '#model-' + point.entrantId}>
              {point.day} · 模拟{point.side === 'buy' ? '买入' : '卖出'} {point.quantity} 股 × {point.price}
            </Link>
          </li>)}
          {points.length === 0 && <li className="py-2 text-sm text-muted-foreground">所选图表日期没有模拟成交。</li>}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
