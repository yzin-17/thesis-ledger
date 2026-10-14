import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { journalReviewReferenceLocatorSchema } from '@thesis-ledger/schemas';
import { getDesktopApiClient } from '@/shared/api/client';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { Account } from '../../portfolio/portfolio.types.js';
import { PageHeader } from '../../shared/PageHeader.js';
import { JournalAccountSelector } from '../JournalAccountSelector.js';
import { JournalCandidateBrowser } from './JournalCandidateBrowser.js';
import { JournalObjectReview } from './JournalObjectReview.js';
import { JournalPeriodReview } from './JournalPeriodReview.js';
import { JournalSnapshotHistory } from './JournalSnapshotHistory.js';
import { JournalLegacyJsonReview } from './JournalLegacyJsonReview.js';
import { JournalEmpty, JournalRequestError } from './JournalReviewFeedback.js';
import { JournalAiTaskHistory } from './JournalAiTaskHistory.js';

type WorkspaceProps = {
  accounts?: Account[];
  accountsReady?: boolean;
  accountsPending?: boolean;
  accountsError?: boolean;
  onRetry?: () => void;
  onNavigateAccounts?: () => void;
  onNavigatePosition?: () => void;
  search?: string;
};
function ScopedReview({ account, search }: { account: Account; search: string }) {
  const params = new URLSearchParams(search);
  const matchesAccount =
    params.get('accountId') === account.id &&
    (!params.get('mode') || params.get('mode') === account.mode);
  const [tab, setTab] = useState('single');
  const [symbolDraft, setSymbolDraft] = useState('');
  const [symbol, setSymbol] = useState('');
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
  const select = (id: string) => {
    setSelected(id);
    setTab('single');
  };
  return (
    <div className="flex flex-col gap-4">
      <FieldGroup className="sm:flex-row sm:items-end">
        <Field className="flex-1">
          <FieldLabel>标的筛选（可选）</FieldLabel>
          <Input
            aria-label="复盘标的筛选"
            placeholder="例如 AAPL.US"
            value={symbolDraft}
            onChange={(event) => setSymbolDraft(event.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          onClick={() => {
            setSymbol(symbolDraft.trim());
            setSelected(null);
          }}
        >
          应用筛选
        </Button>
      </FieldGroup>
      <Tabs value={tab} onValueChange={(value) => typeof value === 'string' && setTab(value)}>
        <TabsList variant="line">
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
            {resolved.isError && (
              <JournalRequestError title="复盘深链无法定位" error={resolved.error} />
            )}
            <JournalCandidateBrowser
              accountId={account.id}
              mode={account.mode}
              symbol={symbol}
              onSelect={select}
              onWindowApplied={() => setSelected(null)}
            />
            {selected ? (
              <JournalObjectReview
                key={selected}
                accountId={account.id}
                mode={account.mode}
                reviewObjectId={selected}
                onHistory={() => {
                  setHistoryObject(selected);
                  setTab('history');
                }}
              />
            ) : (
              <JournalEmpty
                title="选择一个复盘对象"
                description="完整交易周期与单次减仓分别分析。先核对事实与计划，再开始复盘。"
              />
            )}
          </div>
        </TabsContent>
        <TabsContent
          value="period"
          keepMounted
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <JournalPeriodReview
            key={symbol}
            accountId={account.id}
            mode={account.mode}
            symbol={symbol}
            onSelect={select}
          />
        </TabsContent>
        <TabsContent
          value="history"
          keepMounted
          className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
        >
          <div className="flex flex-col gap-3">
            {historyObject && (
              <Button variant="ghost" className="self-start" onClick={() => setHistoryObject(null)}>
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
      <JournalAiTaskHistory accountId={account.id} mode={account.mode} />
      <JournalLegacyJsonReview />
    </div>
  );
}
function Workspace({
  accounts = [],
  accountsReady = true,
  accountsPending = false,
  accountsError = false,
  onRetry,
  onNavigateAccounts,
  onNavigatePosition,
  search = '',
}: WorkspaceProps) {
  const params = new URLSearchParams(search);
  const [accountId, setAccountId] = useState(params.get('accountId') ?? '');
  const [accountChosen, setAccountChosen] = useState(false);
  const requestedMode = params.get('mode');
  const selectedAccount = accountId
    ? accounts.find((row) => row.id === accountId)
    : accounts.find((row) => !requestedMode || row.mode === requestedMode);
  const account =
    !accountChosen && requestedMode && selectedAccount?.mode !== requestedMode
      ? undefined
      : selectedAccount;
  const chooseAccount = (id: string) => {
    setAccountChosen(true);
    setAccountId(id);
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
  else if (accountsPending || !accountsReady) content = <Skeleton className="h-40 w-full" />;
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
        description="先创建实际或模拟账户，再记录可验证的交易事实。"
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
      <div className="flex flex-col gap-4">
        <JournalAccountSelector
          accounts={accounts}
          value={account.id}
          onValueChange={chooseAccount}
        />
        <ScopedReview key={`${account.id}:${account.mode}`} account={account} search={search} />
      </div>
    );
  return (
    <section className="flex min-w-0 flex-col">
      <PageHeader
        eyebrow="投资复盘"
        title="投资复盘工作台"
        description="以实际成交和计划证据复盘交易。完整周期与减仓分别统计，未知事实保留证据不足。"
      />
      {content}
    </section>
  );
}
export function JournalReviewWorkspace(props: WorkspaceProps) {
  return <Workspace key={props.search ?? ''} {...props} />;
}
