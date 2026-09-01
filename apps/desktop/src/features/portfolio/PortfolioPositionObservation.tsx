import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from '@/components/ui/empty';
import { LoaderCircle, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

import { money } from '../shared/display.js';
import { assetQuantityUnit, type Position } from './portfolio.types.js';

export function PositionOverviewMenu({
  positions,
  busyAction,
  clearPositions,
  onCreate,
}: {
  positions: Position[];
  busyAction: string | null;
  clearPositions: () => Promise<void>;
  onCreate: () => void;
}) {
  const busy = busyAction !== null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="更多持仓操作"
            disabled={busy}
            aria-busy={busyAction === 'clear-positions'}
          >
            <MoreHorizontal data-icon="inline-start" aria-hidden="true" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={busy} onClick={onCreate}>
            校准持仓余额
          </DropdownMenuItem>
          {positions.length > 0 && (
            <DropdownMenuItem
              variant="destructive"
              disabled={busy}
              onClick={() => void clearPositions()}
            >
              {busyAction === 'clear-positions' ? '清空中…' : '清空持仓观察'}
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PositionObservationContent({
  positions,
  busyAction,
  onCreate,
  onEdit,
  remove,
}: {
  positions: Position[];
  busyAction: string | null;
  onCreate: () => void;
  onEdit: (position: Position) => void;
  remove: (position: Position) => Promise<void>;
}) {
  if (positions.length === 0) {
    return (
      <Empty className="rounded-lg border p-8" role="status">
        <EmptyHeader>
          <EmptyTitle>暂无持仓观察</EmptyTitle>
          <EmptyDescription>记录一个检查点后会显示在这里。</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button type="button" variant="outline" onClick={onCreate}>
            校准持仓余额
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[960px] border-separate border-spacing-0 text-left text-sm">
        <caption className="sr-only">持仓观察列表</caption>
        <thead className="border-b bg-muted text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-3 font-medium">标的</th>
            <th className="px-4 py-3 text-right font-medium">持仓市值</th>
            <th className="px-4 py-3 text-right font-medium">盈亏</th>
            <th className="px-4 py-3 font-medium">观察状态</th>
            <th className="px-4 py-3 font-medium">来源</th>
            <th className="px-4 py-3 font-medium">校准状态</th>
            <th className="sticky right-0 z-10 w-40 min-w-40 border-l border-border bg-muted px-3 py-3 text-center font-medium">
              操作
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {positions.map((position) => (
            <tr key={position.id} className="align-middle">
              <td className="px-4 py-3">
                <div className="min-w-0">
                  <strong className="block max-w-[320px] truncate font-medium text-foreground">
                    {position.asset.name || position.symbol}
                  </strong>
                  <span className="text-xs text-muted-foreground">
                    {position.symbol} · {position.quantity}
                    {assetQuantityUnit(position.asset.assetType, position.symbol)} ·{' '}
                    {money.format(position.costPrice)}
                  </span>
                </div>
              </td>
              <td className="px-4 py-3 text-right tabular-nums text-foreground">
                {position.marketValue === null ? '—' : money.format(position.marketValue)}
              </td>
              <td
                className={cn(
                  'px-4 py-3 text-right tabular-nums',
                  position.pnl !== null && position.pnl < 0
                    ? 'text-destructive'
                    : 'text-foreground',
                )}
              >
                {position.pnl === null ? '—' : money.format(position.pnl)}
              </td>
              <td className="px-4 py-3">
                <Badge variant="outline">观察检查点</Badge>
              </td>
              <td className="px-4 py-3 text-sm text-muted-foreground">
                {position.source ?? '未知'}
              </td>
              <td className="px-4 py-3">
                <Badge variant="secondary">已校准</Badge>
              </td>
              <td className="sticky right-0 z-10 w-40 min-w-40 border-l border-border bg-background px-3 py-2 text-center">
                <div className="flex items-center justify-center gap-1">
                  <Button
                    className="px-2"
                    size="sm"
                    type="button"
                    variant="recalibrate"
                    disabled={busyAction !== null}
                    onClick={() => onEdit(position)}
                  >
                    重新校准
                  </Button>
                  <Button
                    className="px-2"
                    size="sm"
                    type="button"
                    variant="destructive-ghost"
                    disabled={busyAction !== null}
                    aria-busy={busyAction === `remove:${position.id}`}
                    onClick={() => void remove(position)}
                  >
                    {busyAction === `remove:${position.id}` && (
                      <LoaderCircle
                        data-icon="inline-start"
                        className="animate-spin"
                        aria-hidden="true"
                      />
                    )}
                    {busyAction === `remove:${position.id}` ? '移除中…' : '取消校准'}
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function StandardPositionContent({
  positions,
  busyAction,
  onEdit,
  remove,
}: {
  positions: Position[];
  busyAction: string | null;
  onEdit: (position: Position) => void;
  remove: (position: Position) => Promise<void>;
}) {
  if (positions.length === 0) {
    return (
      <div className="empty-state" role="status">
        暂无持仓，点击右上角“+ 添加持仓”开始。
      </div>
    );
  }

  return (
    <div className="mt-2 divide-y border-y border-border" aria-label="持仓操作">
      {positions.map((position) => (
        <div
          key={position.id}
          className="grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(72px,0.8fr)_minmax(120px,1fr)_minmax(150px,1.4fr)_auto] sm:items-center"
        >
          <div className="min-w-0">
            <strong className="block truncate text-sm font-medium text-foreground">
              {position.asset.name || position.symbol}
            </strong>
            <span className="text-xs text-muted-foreground">
              {position.symbol} · {position.quantity} · {money.format(position.costPrice)}
            </span>
          </div>
          <span className="text-sm text-muted-foreground">
            {position.marketValue === null ? '—' : money.format(position.marketValue)}
          </span>
          <span className="text-sm text-muted-foreground">
            {position.pnl === null ? '—' : money.format(position.pnl)}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">当前记录</Badge>
            <span className="text-xs text-muted-foreground">来源：{position.source ?? '未知'}</span>
          </div>
          <div className="form-actions justify-end">
            <Button
              className="text-button"
              size="sm"
              type="button"
              variant="link"
              onClick={() => onEdit(position)}
            >
              编辑
            </Button>
            <Button
              className="text-button danger"
              size="sm"
              type="button"
              variant="destructive"
              disabled={busyAction !== null}
              aria-busy={busyAction === `remove:${position.id}`}
              onClick={() => void remove(position)}
            >
              {busyAction === `remove:${position.id}` && (
                <LoaderCircle
                  data-icon="inline-start"
                  className="animate-spin"
                  aria-hidden="true"
                />
              )}
              {busyAction === `remove:${position.id}` ? '移除中…' : '删除'}
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
