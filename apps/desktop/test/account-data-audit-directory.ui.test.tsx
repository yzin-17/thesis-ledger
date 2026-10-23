// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import type { LedgerEvent } from '@thesis-ledger/api-client';
import { describe, expect, it, vi } from 'vitest';
import { AuditSheet } from '../src/features/account-data/AccountDataAuditSheets.js';
import type { useAccountLedgerAuditQuery } from '../src/features/account-data/account-data.queries.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const execution = {
  eventId: 'audit-event-1',
  factId: 'audit-fact-1',
  accountId: 'account-1',
  type: 'BUY_EXECUTION',
  revisionAction: 'CREATE',
  occurredAt: '2026-10-14T02:00:00.000Z',
  recordedAt: '2026-10-14T02:01:00.000Z',
  source: { category: 'MANUAL', channel: 'manual' },
  payload: { symbol: '510300.SH', quantity: '200', price: '4', currency: 'CNY' },
} as LedgerEvent;

describe('修正链目录展示', () => {
  it('已有审计读取失败时保留事实，禁用恢复并只通过 GET 重读', async () => {
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    const restore = vi.fn(); const refetch = vi.fn();
    const voidEvent = { ...execution, eventId: 'audit-void-1', revisionAction: 'VOID', supersedesEventId: execution.eventId, reason: '受控作废' } as LedgerEvent;
    const query = { data: { events: [execution, voidEvent] }, isError: true, isPending: false, isFetching: false, refetch } as unknown as ReturnType<typeof useAccountLedgerAuditQuery>;
    const render = () => act(async () => root.render(<AuditSheet target={execution} query={query} onOpenChange={vi.fn()}
      onCorrect={vi.fn()} onVoid={vi.fn()} onRestore={restore} onRestoreTransfer={vi.fn()} />));
    try {
      await render();
      const find = (label: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;
      expect(find('恢复').disabled).toBe(true);
      expect(document.body.textContent).not.toContain('当前有效');
      expect(document.body.textContent).toContain('原始录入');
      await act(async () => find('恢复').click());
      expect(restore).not.toHaveBeenCalled();
      await act(async () => find('重新读取修正链').click());
      expect(refetch).toHaveBeenCalledOnce();
      query.isError = false;
      await render();
      expect(find('恢复').disabled).toBe(false);
    } finally { await act(async () => root.unmount()); host.remove(); }
  });
  it.each([true, false])('目录解析状态 %s 不影响清仓后历史记录与操作', async (resolved) => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    const query = {
      data: {
        events: [execution],
        instrumentDirectory: {
          generation: 9,
          items: resolved ? [{ symbol: '510300.SH', displayName: '目录基金名称' }] : [],
          unresolvedSymbols: resolved ? [] : ['510300.SH'],
        },
      },
      isError: false,
      isPending: false,
    } as ReturnType<typeof useAccountLedgerAuditQuery>;
    try {
      await act(async () =>
        root.render(
          <AuditSheet
            target={execution}
            query={query}
            snapshotPositions={[]}
            onOpenChange={vi.fn()}
            onCorrect={vi.fn()}
            onVoid={vi.fn()}
            onRestore={vi.fn()}
            onRestoreTransfer={vi.fn()}
          />,
        ),
      );
      const row = document.querySelector('[data-audit-event-id="audit-event-1"]');
      expect(row?.textContent).toContain('510300.SH');
      expect(row?.textContent).toContain('买入成交');
      expect(row?.textContent).toContain('更正');
      expect(row?.textContent).toContain('作废');
      if (resolved) expect(row?.textContent).toContain('目录基金名称');
      else expect(row?.textContent).not.toContain('目录基金名称');
    } finally {
      await act(async () => root.unmount());
      host.remove();
    }
  });
});
