import { Ellipsis } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import type { WatchlistChange, WatchlistPage, WatchlistItem } from '@thesis-ledger/schemas';

export function WatchlistMenu({
  item,
  page,
  busy,
  change,
}: {
  item: WatchlistItem;
  page: WatchlistPage;
  busy: boolean;
  change: (op: WatchlistChange) => void;
}) {
  const { revision } = page;
  const peers = page.items.filter((i) => i.groupId === item.groupId && i.pinned === item.pinned);
  const idx = peers.findIndex((i) => i.id === item.id);
  const place = (groupId: string | null, pinned: boolean, beforeId: string | null) =>
    change({ action: 'place', itemId: item.id, groupId, pinned, beforeId, revision });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={busy}
            aria-label={item.displayName + '的操作'}
          />
        }
      >
        <Ellipsis aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onClick={() => place(item.groupId, !item.pinned, null)}>
          {item.pinned ? '取消置顶' : '置顶'}
        </DropdownMenuItem>
        {idx > 0 && (
          <DropdownMenuItem onClick={() => place(item.groupId, item.pinned, peers[idx - 1]!.id)}>
            上移
          </DropdownMenuItem>
        )}
        {idx + 1 < peers.length && (
          <DropdownMenuItem
            onClick={() =>
              change({
                action: 'place',
                itemId: peers[idx + 1]!.id,
                groupId: item.groupId,
                pinned: item.pinned,
                beforeId: item.id,
                revision,
              })
            }
          >
            下移
          </DropdownMenuItem>
        )}
        {[{ id: null, name: '未分组' }, ...page.groups]
          .filter((g) => g.id !== item.groupId)
          .map((g) => (
            <DropdownMenuItem
              key={g.id ?? 'ungrouped'}
              onClick={() => place(g.id, item.pinned, null)}
            >
              移至{g.name}
            </DropdownMenuItem>
          ))}
        <DropdownMenuItem onClick={() => change({ action: 'remove', itemId: item.id, revision })}>
          移出自选
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
