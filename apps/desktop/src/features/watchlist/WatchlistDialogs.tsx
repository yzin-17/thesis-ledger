import { InstrumentSymbolField } from '../market-data/InstrumentSymbolField.js';
import { useState } from 'react';
import { FolderCog, Plus } from 'lucide-react';
import {
  watchlistInstrumentSchema,
  type WatchlistPage,
  type WatchlistChange,
} from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { requestFailureMessage } from '../../shared/api/request-error.js';
import { WatchlistSelect } from './WatchlistSelect.js';

type EditorProps = { busy: boolean; error: unknown; reset: () => void };

export function WatchlistAddDialog({
  busy,
  error,
  reset,
  add,
}: EditorProps & {
  owner: string;
  add: (id: string, done: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
          setText('');
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button size="sm" disabled={busy} />}>
        <Plus />
        添加标的
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>添加标的</DialogTitle>
        </DialogHeader>
        <InstrumentSymbolField
          aria-label="搜索标的"
          value={text}
          onChange={setText}
          disabled={busy}
          accepts={(item) => watchlistInstrumentSchema.safeParse(item).success}
          onSelect={(item) => add(item.id, () => setOpen(false))}
        />
        {error ? <p role="alert" className="text-destructive">{requestFailureMessage(error)}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

export function WatchlistGroupDialog({
  page,
  group,
  busy,
  error,
  reset,
  change,
}: EditorProps & {
  page: WatchlistPage | undefined;
  group: string;
  change: (op: WatchlistChange, done: () => void) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState('');
  const [name, setName] = useState('');
  const edit = (id: string) => {
    const selected = page?.groups.find((g) => g.id === id);
    setTarget(selected?.id ?? '');
    setName(selected?.name ?? '');
  };
  const done = () => setOpen(false);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          reset();
          edit(group);
        }
        setOpen(next);
      }}
    >
      <DialogTrigger render={<Button size="sm" variant="ghost" disabled={busy} />}>
        <FolderCog />
        管理分组
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>管理分组</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!page || busy || !name.trim()) return;
            const revision = page.revision;
            if (target) change({ action: 'renameGroup', groupId: target, name, revision }, done);
            else change({ action: 'createGroup', name, revision }, done);
          }}
        >
          <WatchlistSelect
            label="选择分组"
            value={target}
            onChange={edit}
            options={[
              { value: '', label: '创建新分组' },
              ...(page?.groups ?? []).map((g) => ({ value: g.id, label: g.name })),
            ]}
          />
          <Input
            aria-label="分组名称"
            placeholder="分组名称"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
          {error ? (
            <p role="alert" className="text-destructive">
              {requestFailureMessage(error)}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            {target && (
              <Button
                type="button"
                className="mr-auto"
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  page &&
                  change({ action: 'deleteGroup', groupId: target, revision: page.revision }, done)
                }
              >
                删除分组
              </Button>
            )}
            <Button type="submit" disabled={busy || !name.trim()}>
              {target ? '保存名称' : '新建分组'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
