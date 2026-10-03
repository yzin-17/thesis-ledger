import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { ThesisLedgerApiClient, type LedgerEvent } from '@thesis-ledger/api-client';
import { AuditSheet } from '../../src/features/account-data/AccountDataAuditSheets.js';
import {
  ledgerContractRejected,
  LedgerContractFailure,
} from '../../src/features/account-data/account-data.ledger-contract.js';
import { Button } from '../../src/components/ui/button.js';
import '../../src/styles/base.css';

const accountId = '11111111-1111-4111-8111-111111111111';
const event: LedgerEvent = {
  version: 3,
  eventId: '22222222-2222-4222-8222-222222222222',
  factId: '33333333-3333-4333-8333-333333333333',
  accountId,
  ledgerRevision: '1',
  type: 'BUY_EXECUTION',
  occurredAt: '2026-10-01T02:00:00.000Z',
  timePrecision: 'INSTANT',
  sourceTimezone: 'Asia/Shanghai',
  economicOrderKey: 'a0',
  recordedAt: '2026-10-01T02:00:00.000Z',
  payloadVersion: 1,
  source: { category: 'MANUAL', channel: 'desktop' },
  actorId: 'test',
  revisionAction: 'CREATE',
  payload: {
    symbol: '600519.SH',
    quantity: '10',
    price: '10',
    currency: 'CNY',
    capabilityVerification: 'VERIFIED',
    charges: [],
  },
};
let mode: 'current' | 'old-row' | 'old-envelope' = 'current';
const client = new ThesisLedgerApiClient('https://fixture.test/api/v1', async () => {
  if (mode === 'old-row')
    return new Response(
      JSON.stringify({
        error: 'UNSUPPORTED_CONTRACT_VERSION',
        message: '旧账本事件不支持读取或修订',
      }),
      { status: 409 },
    );
  return new Response(
    JSON.stringify({
      accountId,
      asOfLedgerRevision: '1',
      ledgerRevision: '1',
      projectionGeneration: '1',
      events: [{ ...event, version: mode === 'old-envelope' ? 2 : 3 }],
      effective: false,
      instrumentDirectory: { generation: 0, items: [], unresolvedSymbols: [] },
    }),
  );
});
function Preview() {
  const [target, setTarget] = useState<LedgerEvent | null>(null);
  const query = useQuery({
    queryKey: ['e03-c-audit'],
    queryFn: () => client.ledger.getEventAudit(accountId),
    retry: false,
  });
  const change = (next: typeof mode) => {
    mode = next;
    void query.refetch();
  };
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">当前账本交互验收</h1>
      <p>固定输入验证当前审计展示和读取拒绝；不连接目标数据库。</p>
      <div className="flex gap-2">
        <Button onClick={() => change('current')}>当前信封</Button>
        <Button onClick={() => change('old-row')}>旧行拒绝</Button>
        <Button onClick={() => change('old-envelope')}>旧信封响应</Button>
        <Button onClick={() => setTarget(event)}>打开审计</Button>
      </div>
      {query.isError && ledgerContractRejected(query.error) ? (
        <LedgerContractFailure onRetry={query.refetch} />
      ) : (
        <p>当前可读事件：{query.data?.events.length ?? 0}</p>
      )}
      <AuditSheet
        target={target}
        query={query}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        onCorrect={() => {}}
        onVoid={() => {}}
        onRestore={() => {}}
        onRestoreTransfer={() => {}}
      />
    </main>
  );
}
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <Preview />
  </QueryClientProvider>,
);
