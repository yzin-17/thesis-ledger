import type { Dispatch, SetStateAction } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { LoaderCircle } from 'lucide-react';

import type { Account } from '../portfolio/portfolio.types.js';
import { EmptyListState } from '../shared/EmptyStates.js';
import type { LoadState } from '../shared/types.js';
import type { ImportDraftRecord, ImportRow } from './import.types.js';

export const accountTypeLabel = (type: Account['type']) => {
  if (type === 'fund') return '基金';
  if (type === 'cash') return '现金';
  return '证券';
};

export const importSourceLabel = (source: ImportDraftRecord['source']) => {
  if (source === 'alipay') return '支付宝';
  if (source === 'ths') return '同花顺';
  if (source === 'broker') return '券商';
  if (source === 'bank') return '银行';
  if (source === 'fund-platform') return '基金平台';
  return '待识别';
};

export function ScreenshotImportUpload({
  accounts,
  accountId,
  source,
  accountLocked,
  busyAction,
  onAccountChange,
  onSourceChange,
  onSubmit,
}: {
  accounts: Account[];
  accountId: string;
  source: ImportDraftRecord['source'];
  accountLocked: boolean;
  busyAction: string | null;
  onAccountChange: (value: string) => void;
  onSourceChange: (value: ImportDraftRecord['source']) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form className="upload-bar" onSubmit={onSubmit}>
      <label>
        账户
        <Select
          disabled={accountLocked}
          value={accountId || null}
          onValueChange={(value) => {
            if (value) onAccountChange(value);
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="选择账户">
              {accounts.find((account) => account.id === accountId)?.name ?? '选择账户'}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {accounts.map((account) => (
                <SelectItem key={account.id} value={account.id}>
                  {account.name} · {account.institution || '未填写机构'} · {account.currency} ·{' '}
                  {accountTypeLabel(account.type)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label>
        截图来源
        <Select value={source} onValueChange={(value) => value && onSourceChange(value)}>
          <SelectTrigger className="w-full">
            <SelectValue>{importSourceLabel(source)}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="unknown">待识别</SelectItem>
              <SelectItem value="alipay">支付宝</SelectItem>
              <SelectItem value="ths">同花顺</SelectItem>
              <SelectItem value="broker">券商</SelectItem>
              <SelectItem value="bank">银行</SelectItem>
              <SelectItem value="fund-platform">基金平台</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </label>
      <label>
        持仓截图
        <Input name="file" type="file" required accept="image/png,image/jpeg,image/webp" />
      </label>
      <Button type="submit" variant="default" disabled={busyAction !== null}>
        {busyAction === 'upload' && (
          <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
        )}
        {busyAction === 'upload' ? '创建中…' : '创建草稿'}
      </Button>
    </form>
  );
}

export function ScreenshotImportDraftList({
  loadState,
  drafts,
  selectedId,
  onChoose,
}: {
  loadState: LoadState;
  drafts: ImportDraftRecord[];
  selectedId: string | null;
  onChoose: (draft: ImportDraftRecord) => void;
}) {
  return (
    <aside className="draft-list" aria-label="导入历史">
      {loadState === 'empty' ? (
        <EmptyListState className="min-h-0 items-start px-0 py-6 text-left" />
      ) : (
        drafts.map((draft) => (
          <Button
            key={draft.id}
            className={cn('draft', selectedId === draft.id && 'active')}
            size="sm"
            type="button"
            variant="ghost"
            onClick={() => onChoose(draft)}
          >
            <strong>{new Date(draft.createdAt).toLocaleString('zh-CN')}</strong>
            <span>
              {draft.source} · {draft.status}
            </span>
          </Button>
        ))
      )}
    </aside>
  );
}

export function ScreenshotImportEditor({
  selected,
  rows,
  busyAction,
  markDirty,
  setRows,
  updateRow,
  onCommit,
  onRollback,
}: {
  selected: ImportDraftRecord | null;
  rows: ImportRow[];
  busyAction: string | null;
  markDirty: () => void;
  setRows: Dispatch<SetStateAction<ImportRow[]>>;
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
  onCommit: () => void;
  onRollback: (draft: ImportDraftRecord) => void;
}) {
  if (!selected) return <div className="empty-inline">选择一条历史记录，或上传截图创建草稿。</div>;
  const addRow = () => {
    markDirty();
    setRows((current) => [
      ...current,
      {
        rawSymbol: '',
        symbol: '',
        matchStatus: 'unmatched',
        matchCandidates: [],
        confidence: 1,
        rawText: {},
        issues: [],
      },
    ]);
  };
  return (
    <>
      <div className="review-heading">
        <div>
          <h2>候选持仓</h2>
          <p>
            {rows.length} 行 · 来源置信度 {Math.round(Number(selected.sourceConfidence) * 100)}%
          </p>
        </div>
        <Button className="secondary" type="button" variant="outline" onClick={addRow}>
          添加一行
        </Button>
      </div>
      {rows.length === 0 ? (
        <EmptyListState />
      ) : (
        rows.map((row, index) => (
          <ScreenshotImportRow
            key={`${index}-${row.rawSymbol}`}
            row={row}
            index={index}
            onUpdate={updateRow}
            onDelete={(rowIndex) => {
              markDirty();
              setRows((current) => current.filter((_, currentIndex) => currentIndex !== rowIndex));
            }}
          />
        ))
      )}
      <div className="form-actions">
        <Button
          disabled={selected.status === 'committed' || busyAction !== null}
          aria-busy={busyAction === 'commit'}
          type="button"
          variant="default"
          onClick={onCommit}
        >
          {busyAction === 'commit' && (
            <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
          )}
          {busyAction === 'commit' ? '提交中…' : '确认并提交'}
        </Button>
        {selected.status === 'committed' && (
          <Button
            className="secondary"
            type="button"
            variant="outline"
            disabled={busyAction !== null}
            aria-busy={busyAction === `rollback:${selected.id}`}
            onClick={() => onRollback(selected)}
          >
            {busyAction === `rollback:${selected.id}` && (
              <LoaderCircle data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            )}
            {busyAction === `rollback:${selected.id}` ? '回滚中…' : '回滚本次导入'}
          </Button>
        )}
      </div>
    </>
  );
}

function ScreenshotImportRow({
  row,
  index,
  onUpdate,
  onDelete,
}: {
  row: ImportRow;
  index: number;
  onUpdate: (index: number, patch: Partial<ImportRow>) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <div className="review-row">
      <label>
        名称
        <Input
          value={row.rawName ?? ''}
          onChange={(event) => onUpdate(index, { rawName: event.target.value })}
        />
      </label>
      <label>
        代码
        <Input
          value={row.symbol ?? ''}
          onChange={(event) => onUpdate(index, { symbol: event.target.value.toUpperCase() })}
        />
      </label>
      <label>
        数量
        <Input
          type="number"
          min="0"
          step="any"
          value={row.quantity ?? ''}
          onChange={(event) => onUpdate(index, { quantity: event.target.value })}
        />
      </label>
      <label>
        成本价
        <Input
          type="number"
          min="0"
          step="any"
          value={row.costPrice ?? ''}
          onChange={(event) => onUpdate(index, { costPrice: event.target.value })}
        />
      </label>
      <div className="row-status">
        <Badge className={cn('tag', row.confidence < 0.75 && 'warning')} variant="secondary">
          {Math.round(row.confidence * 100)}%
        </Badge>
        {row.issues.map((issue) => (
          <small key={issue}>{issue}</small>
        ))}
      </div>
      <Button
        className="text-button danger"
        size="sm"
        type="button"
        variant="destructive"
        onClick={() => onDelete(index)}
      >
        删除
      </Button>
    </div>
  );
}
