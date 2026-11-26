import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  journalReviewQuerySchema,
  journalReviewReferenceLocatorSchema,
} from '@thesis-ledger/schemas';
import { journalReviewWindow } from '@thesis-ledger/domain';
import { getDesktopApiClient } from '@/shared/api/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/spinner';
import type { Account } from '../../portfolio/portfolio.types.js';
import { PageHeader } from '../../shared/PageHeader.js';
import { RefreshIconButton } from '../../shared/RefreshIconButton.js';
import { usePageRefresh } from '../../shared/usePageRefresh.js';
import { portfolioKeys } from '../../portfolio/portfolio.queries.js';
import { JournalAccountSelector } from '../JournalAccountSelector.js';
import { JournalCandidateBrowser } from './JournalCandidateBrowser.js';
import { JournalFilterBar, type JournalFilterDraft } from './JournalFilterBar.js';
import { JournalObjectReview } from './JournalObjectReview.js';
import { JournalPeriodReview } from './JournalPeriodReview.js';
import { JournalSnapshotHistory } from './JournalSnapshotHistory.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { useGuardedTransition } from '../../shared/navigation-guard.js';

type WorkspaceProps = {
  modelWeekliesLink?: ReactNode;
  mode?: Account['mode'];
  onAccountChange?: (accountId: string) => void;
  accounts?: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  onRetry?: () => void;
  onNavigateAccounts?: () => void;
  onNavigatePosition?: () => void;
  search?: string;
};
const emptyFilter: JournalFilterDraft = { symbol: '', start: '', end: '' };

function ScopedReview({
  account,
  search,
  accountSelector,
}: {
  account: Account;
  search: string;
  accountSelector: ReactNode;
}) {
  const params = new URLSearchParams(search);
  const matchesAccount =
    params.get('accountId') === account.id &&
    (!params.get('mode') || params.get('mode') === account.mode);
  const [tab, setTab] = useState('single');
  const [draft, setDraft] = useState<JournalFilterDraft>(emptyFilter);
  const [filter, setFilter] = useState<JournalFilterDraft>(emptyFilter);
  const [filterError, setFilterError] = useState<Error | null>(null);
  const [choice, setSelected] = useState<string | null | undefined>(() => {
    if (!matchesAccount) return null;
    return params.get('reviewObjectId') ?? undefined;
  });
  const reference = {
    accountId: account.id,
    mode: account.mode,
    tradeId: params.get('tradeId'),
    reviewObjectType: params.get('reviewObjectType'),
    ...(params.get('closeSliceId') ? { closeSliceId: params.get('closeSliceId') } : {}),
  };
  const resolved = useQuery({
    queryKey: ['journal-review-reference', reference],
    enabled: matchesAccount && choice === undefined && Boolean(reference.tradeId),
    queryFn: ({ signal }) =>
      getDesktopApiClient().journalReviews.resolveReference(
        journalReviewReferenceLocatorSchema.parse(reference),
        signal,
      ),
    retry: false,
  });
  const selected =
    choice === undefined ? (resolved.data?.input.reference.reviewObjectId ?? null) : choice;
  const [historyObject, setHistoryObject] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string>();
  const guard = useGuardedTransition();
  const applyFilter = () => {
    const next = { symbol: draft.symbol.trim(), start: draft.start, end: draft.end };
    try {
      journalReviewQuerySchema.parse({
        accountId: account.id,
        mode: account.mode,
        ...(next.symbol ? { symbol: next.symbol } : {}),
        ...(next.start ? { start: next.start } : {}),
        ...(next.end ? { end: next.end } : {}),
      });
      journalReviewWindow({
        ...(next.start ? { start: next.start } : {}),
        ...(next.end ? { end: next.end } : {}),
      });
      setFilter(next);
      setSelected(null);
      setFilterError(null);
    } catch {
      setFilterError(new Error('请选择有效时间，结束时间不能早于开始时间'));
    }
  };
  const resetFilter = () => {
    setDraft(emptyFilter);
    setFilter(emptyFilter);
    setSelected(null);
    setFilterError(null);
  };
  const select = (id: string, label?: string) => {
    setSelected(id);
    setSelectedLabel(label);
    setTab('single');
  };
  // 草稿或已生效条件任一非空，都允许清空 —— 否则用户输入后又想放弃时无路可退。
  const hasConditions = Boolean(
    draft.symbol || draft.start || draft.end || filter.symbol || filter.start || filter.end,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-xs">{accountSelector}</div>
      <Tabs value={tab} onValueChange={(value) => typeof value === 'string' && setTab(value)}>
        <TabsList variant="line" className="w-auto">
          <TabsTrigger value="single">单笔复盘</TabsTrigger>
          <TabsTrigger value="period">周期复盘</TabsTrigger>
          <TabsTrigger value="history">历史快照</TabsTrigger>
        </TabsList>
        <TabsContent
          value="single"
          keepMounted
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <div className="flex flex-col gap-4">
            <JournalFilterBar
              draft={draft}
              onChange={setDraft}
              onApply={applyFilter}
              onReset={resetFilter}
              hasConditions={hasConditions}
              error={filterError}
            />
            {resolved.isError && (
              <JournalRequestError title="复盘深链无法定位" error={resolved.error} />
            )}
            <div className="min-w-0">
              <JournalCandidateBrowser
                accountId={account.id}
                mode={account.mode}
                symbol={filter.symbol}
                window={{ start: filter.start, end: filter.end }}
                selectedId={selected}
                onSelect={select}
                onResetFilter={resetFilter}
              />
            </div>
            <Sheet
              open={Boolean(selected)}
              onOpenChange={(nextOpen) => {
                if (nextOpen) return;
                const close = () => setSelected(null);
                if (guard) {
                  void guard.request(close, {
                    title: '放弃未应用的草稿？',
                    description: '关闭复盘后，本次未应用的计划补充将丢失。',
                    confirmLabel: '放弃修改并关闭',
                  });
                } else close();
              }}
            >
              <SheetContent size="detail" className="overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>单笔复盘</SheetTitle>
                  <SheetDescription className="sr-only">
                    核对交易事实、执行分析和保存复盘快照
                  </SheetDescription>
                </SheetHeader>
                {selected && (
                  <JournalObjectReview
                    key={selected}
                    accountId={account.id}
                    mode={account.mode}
                    reviewObjectId={selected}
                    instrumentLabel={selectedLabel}
                    onHistory={() => {
                      setHistoryObject(selected);
                      setSelected(null);
                      setTab('history');
                    }}
                  />
                )}
              </SheetContent>
            </Sheet>
          </div>
        </TabsContent>
        <TabsContent
          value="period"
          keepMounted
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <JournalPeriodReview accountId={account.id} mode={account.mode} onSelect={select} />
        </TabsContent>
        <TabsContent
          value="history"
          keepMounted
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <div className="flex flex-col gap-3">
            {historyObject && (
              <Button
                variant="outline"
                className="self-start"
                onClick={() => setHistoryObject(null)}
              >
                显示账户全部快照
              </Button>
            )}
            <JournalSnapshotHistory
              key={historyObject ?? 'all'}
              accountId={account.id}
              mode={account.mode}
              reviewObjectId={historyObject}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
function Workspace(props: WorkspaceProps) {
  const control = useReviewWorkspace(props);
  const { refreshing, refresh, content } = control;

  return (
    <section className="flex min-w-0 flex-col">
      <PageHeader
        className="mb-card"
        eyebrow="INVESTMENT JOURNAL"
        title="投资复盘"
        actions={
          <>
            {props.modelWeekliesLink}
            <RefreshIconButton
              label="刷新复盘数据"
              refreshing={refreshing}
              onClick={() => void refresh()}
            />
          </>
        }
      />
      {content}
    </section>
  );
}
export function JournalReviewWorkspace(props: WorkspaceProps) {
  return <Workspace key={`${props.mode ?? ''}:${props.search ?? ''}`} {...props} />;
}

function useReviewWorkspace({
  accounts: allAccounts = [],
  mode,
  onAccountChange,
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
  search = '',
}: WorkspaceProps) {
  const accounts = mode ? allAccounts.filter((account) => account.mode === mode) : allAccounts;
  const guard = useGuardedTransition();
  const { refreshing, refresh } = usePageRefresh([
    { queryKey: portfolioKeys.accounts() },
    {
      predicate: ({ queryKey }) =>
        typeof queryKey[0] === 'string' && queryKey[0].startsWith('journal-review-'),
    },
  ]);
  const params = new URLSearchParams(search);
  const [accountId, setAccountId] = useState(params.get('accountId') ?? '');
  const [accountChosen, setAccountChosen] = useState(false);
  const requestedMode = mode ?? params.get('mode');
  const account = selectedReviewAccount(accounts, accountId, requestedMode, accountChosen);
  const chooseAccount = (id: string) => {
    const commit = () => {
      setAccountChosen(true);
      setAccountId(id);
      onAccountChange?.(id);
    };
    if (guard)
      void guard.request(commit, {
        title: '放弃未保存的修改？',
        description: '切换复盘账户后，本次未保存修改将丢失。',
        confirmLabel: '放弃修改并切换账户',
      });
    else commit();
  };
  let content;
  if (accountsError)
    content = (
      <JournalRequestError
        title="账户读取失败"
        error={new Error('账户列表暂时不可用')}
        {...(onRetry ? { retry: onRetry } : {})}
      />
    );
  else if (accountsPending || !accountsReady) content = <LoadingState label="正在加载账户" />;
  else if (!account && accounts.length > 0)
    content = (
      <div className="flex flex-col gap-4">
        <JournalRequestError
          title="复盘账户不可用"
          error={new Error('深链账户不存在或模式不匹配，请重新选择账户')}
        />
        <JournalAccountSelector accounts={accounts} value="" onValueChange={chooseAccount} />
      </div>
    );
  else if (!account)
    content = (
      <JournalEmpty
        title="还没有复盘账户"
        description={
          mode
            ? `当前${mode === 'shadow' ? '模拟' : '实际'}范围还没有账户，请先创建账户并记录可验证的交易事实。`
            : '先创建实际或模拟账户，再记录可验证的交易事实。'
        }
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={onNavigateAccounts}>管理账户</Button>
            <Button variant="outline" onClick={onNavigatePosition}>
              录入交易
            </Button>
          </div>
        }
      />
    );
  else
    content = (
      <ScopedReview
        key={`${account.id}:${account.mode}`}
        account={account}
        search={search}
        accountSelector={
          <JournalAccountSelector
            accounts={accounts}
            value={account.id}
            onValueChange={chooseAccount}
            layout="stacked"
          />
        }
      />
    );

  return { refreshing, refresh, content };
}

function selectedReviewAccount(
  accounts: Account[],
  accountId: string,
  requestedMode: string | null,
  accountChosen: boolean,
) {
  const selectedAccount = accountId
    ? accounts.find((row) => row.id === accountId)
    : accounts.find((row) => !requestedMode || row.mode === requestedMode);
  const account =
    !accountChosen && requestedMode && selectedAccount?.mode !== requestedMode
      ? undefined
      : selectedAccount;
  return account;
}
