import { ChevronDownIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { marketToneClass } from '@/ui/market-color';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { FundNavTradeGroup } from './fund-nav-trade-model.js';
import type { FundNavTrades } from './useFundNavTrades.js';

export function FundNavTradeDetails({
  trades,
  selectedId,
  onSelect,
}: {
  trades: FundNavTrades;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const selected = trades.groups.find((group) => group.id === selectedId);
  if (!trades.enabled) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2 text-xs text-muted-foreground">
      <div className="flex flex-wrap items-center gap-2">
        {trades.groups.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button type="button" variant="ghost" size="sm" />}>
              查看成交记录
              <ChevronDownIcon
                data-icon="inline-end"
                aria-hidden="true"
                className="transition-transform group-aria-expanded/button:rotate-180"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-64 max-w-[calc(100vw-2rem)]"
              aria-label="净值图成交记录"
            >
              <DropdownMenuGroup>
                {trades.groups.map((group) => (
                  <DropdownMenuItem key={group.id} onClick={() => onSelect(group.id)}>
                    {group.date}{' '}
                    <span className={marketToneClass(group.side === 'buy' ? 'up' : 'down')}>
                      {group.side === 'buy' ? '买入' : '卖出'}
                    </span>
                    {' · '}
                    {group.trades.length}笔
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {trades.error && (
          <span role="status">
            成交读取失败{trades.groups.length ? '，保留上次买卖点。' : '，净值仍可查看。'}
          </span>
        )}
        {trades.notice && <span role="status">{trades.notice}</span>}
        {(trades.error || trades.unavailable) && (
          <Button type="button" variant="outline" size="sm" onClick={trades.retry}>
            重试读取成交
          </Button>
        )}
      </div>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) onSelect(null);
        }}
      >
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>成交详情</DialogTitle>
            <DialogDescription className="pr-6 break-words">
              {trades.position?.asset.name} · {trades.position?.symbol}
              <br />
              {trades.position?.accountName ?? '当前账户'} ·{' '}
              {trades.position?.mode === 'shadow' ? '模拟账户' : '实际账户'}
            </DialogDescription>
          </DialogHeader>
          {selected && <TradeRecords group={selected} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TradeRecords({ group }: { group: FundNavTradeGroup }) {
  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm text-foreground">
      {group.trades.map((trade) => (
        <dl
          key={trade.id}
          className="m-0 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-border pb-4 last:border-0 last:pb-0"
        >
          <dt className="text-muted-foreground">方向</dt>
          <dd className="m-0">
            <span className={marketToneClass(trade.side === 'buy' ? 'up' : 'down')}>
              {trade.side === 'buy' ? '买入' : '卖出'}
            </span>
          </dd>
          <dt className="text-muted-foreground">成交时间</dt>
          <dd className="m-0 break-words">
            {trade.timePrecision === 'DATE'
              ? `${trade.tradingDate}（按日记录）`
              : new Intl.DateTimeFormat('zh-CN', {
                  timeZone: 'Asia/Shanghai',
                  dateStyle: 'medium',
                  timeStyle: 'medium',
                  hourCycle: 'h23',
                }).format(new Date(trade.occurredAt))}
          </dd>
          <dt className="text-muted-foreground">成交数量</dt>
          <dd className="m-0 break-all tabular-nums">{trade.quantity}</dd>
          <dt className="text-muted-foreground">成交价格</dt>
          <dd className="m-0 break-all tabular-nums">
            {trade.price} {trade.currency}
          </dd>
        </dl>
      ))}
    </div>
  );
}
