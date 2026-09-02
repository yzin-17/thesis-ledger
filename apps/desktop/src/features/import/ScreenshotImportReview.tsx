import { useEffect, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { useConfirmDialog } from '@/components/ui/confirm-dialog';
import { useToastManager } from '@/components/ui/toast';
import { cn } from '@/lib/utils';

import type { Account } from '../portfolio/portfolio.types.js';
import { DataStateBanner } from '../shared/DesktopPrimitives.js';
import { resolveLoadState } from '../shared/loadState.js';
import type { LoadState } from '../shared/types.js';
import {
  ScreenshotImportDraftList,
  ScreenshotImportEditor,
  ScreenshotImportUpload,
} from './ScreenshotImportSections.js';
import {
  useCommitImportDraftMutation,
  useRollbackImportDraftMutation,
  useUploadScreenshotImportMutation,
} from './import.mutations.js';
import { useImportDraftsQuery } from './import.queries.js';
import type { ImportDraftRecord, ImportRow } from './import.types.js';

type ScreenshotImportContentProps = {
  accounts: Account[];
  accountId: string;
  source: ImportDraftRecord['source'];
  accountLocked: boolean;
  embedded: boolean;
  busyAction: string | null;
  loadState: LoadState;
  drafts: ImportDraftRecord[];
  selected: ImportDraftRecord | null;
  rows: ImportRow[];
  confirmDiscard: () => Promise<boolean>;
  loadDrafts: (accountId: string) => Promise<void>;
  upload: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  choose: (draft: ImportDraftRecord) => void;
  updateRow: (index: number, patch: Partial<ImportRow>) => void;
  commit: () => Promise<void>;
  rollback: (draft: ImportDraftRecord) => Promise<void>;
  markDirty: (nextDirty?: boolean) => void;
  setAccountId: (accountId: string) => void;
  setSource: (source: ImportDraftRecord['source']) => void;
  setRows: Dispatch<SetStateAction<ImportRow[]>>;
};

export function ScreenshotImportReview({
  accounts,
  initialAccountId,
  onPortfolioChanged,
  onDirtyChange,
  embedded = false,
  accountLocked = false,
}: {
  accounts: Account[];
  initialAccountId?: string;
  onPortfolioChanged: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  embedded?: boolean;
  accountLocked?: boolean;
}) {
  const [accountId, setAccountId] = useState(initialAccountId ?? '');
  const [source, setSource] = useState<ImportDraftRecord['source']>('unknown');
  const [selected, setSelected] = useState<ImportDraftRecord | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const { confirm } = useConfirmDialog();
  const toastManager = useToastManager();
  const draftsQuery = useImportDraftsQuery(accountId);
  const uploadMutation = useUploadScreenshotImportMutation();
  const commitMutation = useCommitImportDraftMutation();
  const rollbackMutation = useRollbackImportDraftMutation();
  const drafts = draftsQuery.data ?? [];
  const hasDraftData = draftsQuery.data !== undefined;
  const loadState =
    accounts.length === 0
      ? 'empty'
      : resolveLoadState([draftsQuery], hasDraftData, hasDraftData && drafts.length === 0);
  const markDirty = (nextDirty = true) => {
    setDirty(nextDirty);
    onDirtyChange?.(nextDirty);
  };
  const confirmDiscard = async () => {
    if (!dirty) return true;
    return confirm({
      title: '放弃未保存修改？',
      description: '当前有未保存修改，切换后会丢弃，继续吗？',
      confirmLabel: '放弃修改',
      cancelLabel: '继续编辑',
      variant: 'destructive',
    });
  };
  useEffect(() => {
    if (accountLocked && initialAccountId && initialAccountId !== accountId) {
      setAccountId(initialAccountId);
      return;
    }
    if (!accountId && accounts[0]) setAccountId(accounts[0].id);
  }, [accountId, accountLocked, accounts, initialAccountId]);

  const loadDrafts = async (nextAccountId: string) => {
    if (nextAccountId === accountId) await draftsQuery.refetch();
    else setAccountId(nextAccountId);
  };
  const upload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busyAction) return;
    const fileInput = event.currentTarget.elements.namedItem('file') as HTMLInputElement;
    const file = fileInput.files?.[0];
    if (!file || !accountId) return;
    setBusyAction('upload');
    try {
      const draft = await uploadMutation.mutateAsync({ file, accountId, source });
      setSelected(draft);
      setRows(draft.rows);
      markDirty(false);
      toastManager.add({
        title: '截图草稿已创建',
        description: '请逐项确认后提交。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '截图上传失败',
        description: '请确认格式和大小不超过 10MB。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const choose = async (draft: ImportDraftRecord) => {
    if (!(await confirmDiscard())) return;
    setSelected(draft);
    setRows(draft.rows);
    setSource(draft.source);
    markDirty(false);
  };
  const updateRow = (index: number, patch: Partial<ImportRow>) => {
    markDirty();
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              ...patch,
              matchStatus: patch.symbol ? 'matched' : row.matchStatus,
              confidence: 1,
              issues: [],
            }
          : row,
      ),
    );
  };
  const commit = async () => {
    if (!selected || busyAction) return;
    setBusyAction('commit');
    try {
      await commitMutation.mutateAsync({ draftId: selected.id, rows, source });
      setSelected({ ...selected, status: 'committed', rows });
      markDirty(false);
      onPortfolioChanged();
      toastManager.add({
        title: '导入已提交',
        description: '组合已重新估值。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '导入提交失败',
        description: '仍有未解决字段，请检查代码、数量、成本价和数值关系。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };
  const rollback = async (draft: ImportDraftRecord) => {
    if (busyAction) return;
    setBusyAction(`rollback:${draft.id}`);
    try {
      await rollbackMutation.mutateAsync(draft.id);
      markDirty(false);
      onPortfolioChanged();
      toastManager.add({
        title: '导入已回滚',
        description: '已恢复到本次导入前的持仓。',
        type: 'success',
        timeout: 2800,
      });
    } catch {
      toastManager.add({
        title: '导入回滚失败',
        description: '该记录无法回滚，请稍后重试。',
        type: 'error',
        timeout: 0,
        priority: 'high',
      });
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <ScreenshotImportContent
      accounts={accounts}
      accountId={accountId}
      source={source}
      accountLocked={accountLocked}
      embedded={embedded}
      busyAction={busyAction}
      loadState={loadState}
      drafts={drafts}
      selected={selected}
      rows={rows}
      confirmDiscard={confirmDiscard}
      loadDrafts={loadDrafts}
      upload={upload}
      choose={(draft) => {
        void choose(draft);
      }}
      updateRow={updateRow}
      commit={commit}
      rollback={rollback}
      markDirty={markDirty}
      setAccountId={setAccountId}
      setSource={setSource}
      setRows={setRows}
    />
  );
}

function ScreenshotImportContent({
  accounts,
  accountId,
  source,
  accountLocked,
  embedded,
  busyAction,
  loadState,
  drafts,
  selected,
  rows,
  confirmDiscard,
  loadDrafts,
  upload,
  choose,
  updateRow,
  commit,
  rollback,
  markDirty,
  setAccountId,
  setSource,
  setRows,
}: ScreenshotImportContentProps) {
  const handleAccountChange = async (value: string) => {
    if (!(await confirmDiscard())) return;
    markDirty(false);
    setAccountId(value);
  };

  return (
    <div
      className={cn(
        'import-screenshot-content',
        embedded && 'embedded min-h-0 content-start overflow-auto',
      )}
    >
      {!embedded && (
        <div className="panel-heading">
          <h2>截图导入</h2>
          <p>上传不会直接修改持仓。代码歧义、低置信度或数值不一致必须先人工修正。</p>
        </div>
      )}
      <Button
        className="secondary mb-[18px]"
        type="button"
        variant="outline"
        onClick={() => {
          if (accountId) void loadDrafts(accountId);
        }}
      >
        刷新导入历史
      </Button>
      {accounts.length === 0 ? (
        <div className="notice">请先在“录入持仓”的账户管理中创建账户。</div>
      ) : (
        <ScreenshotImportUpload
          accounts={accounts}
          accountId={accountId}
          source={source}
          accountLocked={accountLocked}
          busyAction={busyAction}
          onAccountChange={(value) => void handleAccountChange(value)}
          onSourceChange={(value) => {
            markDirty();
            setSource(value);
          }}
          onSubmit={(event) => void upload(event)}
        />
      )}
      <DataStateBanner
        state={loadState}
        onRetry={accountId ? () => void loadDrafts(accountId) : undefined}
      />
      <div className="review-layout">
        <ScreenshotImportDraftList
          loadState={loadState}
          drafts={drafts}
          selectedId={selected?.id ?? null}
          onChoose={choose}
        />
        <div className="review-table">
          <ScreenshotImportEditor
            selected={selected}
            rows={rows}
            busyAction={busyAction}
            markDirty={() => markDirty()}
            setRows={setRows}
            updateRow={updateRow}
            onCommit={() => void commit()}
            onRollback={(draft) => void rollback(draft)}
          />
        </div>
      </div>
    </div>
  );
}
