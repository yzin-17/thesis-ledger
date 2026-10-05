import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useMutation, useQuery, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JournalReviewWorkspace } from '../src/features/journal/review/JournalReviewWorkspace.js';
import { fetchAccounts } from '../src/features/portfolio/portfolio.api.js';
import { Button } from '../src/components/ui/button.js';
import { Input } from '../src/components/ui/input.js';
import { importExistingJournalReferences } from './browser-journal-existing-reference.js';
import {
  armJournalExistingReadFailure,
  installJournalExistingAudit,
  readJournalExistingAudit,
  setJournalExistingPhase,
} from './browser-journal-existing-audit.js';
import '../src/ui/styles.css';

installJournalExistingAudit();
const controlsClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
});
function ExistingReportControls() {
  const [phase, setPhase] = useState('');
  const [notice, setNotice] = useState('');
  const [rows, setRows] = useState(readJournalExistingAudit);
  const imported = useMutation({
    mutationFn: importExistingJournalReferences,
    onSuccess: () => controlsClient.invalidateQueries({ queryKey: ['journal-review-ai-tasks'] }),
  });
  useEffect(() => {
    const update = () => setRows(readJournalExistingAudit());
    window.addEventListener('journal-existing-audit', update);
    return () => window.removeEventListener('journal-existing-audit', update);
  }, []);
  const submitted = rows.filter(
    (row) => row.method === 'POST' && /\/explanations$|\/period-explanations$/.test(row.path),
  );
  return (
    <div className="flex flex-col gap-3 border-b p-4" role="region" aria-label="既有报告验收控制">
      <p>真实 API 验收：正式工作台读取目标账户、既有报告和快照；本页记录请求并限制写入。</p>
      <div className="flex flex-wrap gap-2">
        <Button disabled={imported.isPending} onClick={() => imported.mutate()}>
          导入既有验收任务引用
        </Button>
        <Button variant="outline" onClick={() => window.location.reload()}>
          刷新当前验收页
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            armJournalExistingReadFailure();
            setNotice('已设置下一次 AI GET 返回 503；只影响本页，不改变服务端任务。');
          }}
        >
          注入一次 AI 读取失败
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="验收请求阶段" value={phase} onChange={(e) => setPhase(e.target.value)} />
        <Button
          variant="outline"
          onClick={() => {
            setJournalExistingPhase(phase);
            setNotice(`请求阶段：${phase}`);
          }}
        >
          记录请求阶段
        </Button>
      </div>
      {imported.data && <p>{imported.data}</p>}
      {imported.error && <p role="alert">{imported.error.message}</p>}
      {notice && <p>{notice}</p>}
      <p>
        已记录 {rows.length} 个请求；AI 创建尝试 {submitted.length}，实际发送{' '}
        {submitted.filter((row) => row.source === 'target').length}。
      </p>
      <details>
        <summary>查看验收请求记录</summary>
        <pre
          className="max-h-72 overflow-auto whitespace-pre-wrap break-all text-xs"
          data-journal-request-audit
        >
          {JSON.stringify(rows, null, 2)}
        </pre>
      </details>
    </div>
  );
}
function ExistingReportWorkspace() {
  const accounts = useQuery({
    queryKey: ['existing-report-accounts'],
    queryFn: () => fetchAccounts(),
  });
  return (
    <main className="min-w-0 p-4">
      <JournalReviewWorkspace
        accounts={accounts.data ?? []}
        accountsReady={accounts.isSuccess}
        accountsPending={accounts.isPending}
        accountsError={accounts.isError}
        onRetry={() => void accounts.refetch()}
        search={window.location.search}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={controlsClient}>
    <ExistingReportControls />
    <ExistingReportWorkspace />
  </QueryClientProvider>,
);
