// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { ReconciliationScreen } from '../../src/features/reconciliation/ReconciliationScreen';
import { emptyLedger, ledgerAccount, ledgerAccountId as accountId } from './ledger-fixture';

describe('手机确定性对账读后确认', () => {
  it('409 保留原因和打开时版本，不替换版本自动重试', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith('/accounts')) return Response.json([ledgerAccount]);
      if (path.endsWith('/events')) return Response.json(emptyLedger);
      if (!init?.method)
        return Response.json({
          accountId,
          ruleVersion: 1,
          checkpoints: [],
          candidates: [
            {
              candidateId: 'candidate-1',
              baselineFactId: '00000000-0000-4000-8000-000000000006',
              symbol: '510300.SH',
              executionFactIds: ['00000000-0000-4000-8000-000000000007'],
              observedQuantity: '100',
              coveredQuantity: '100',
              coveredCost: '312.345678',
              remainingQuantity: '0',
              remainingCost: '0',
              status: 'AVAILABLE',
              matchBasis: ['ACCOUNT_MATCH'],
              conflictReasons: [],
            },
          ],
        });
      return Response.json(
        { error: 'LEDGER_REVISION_CONFLICT', message: '账本版本已变化，请重新读取' },
        { status: 409 },
      );
    });
    view.params = { accountId };
    setApi(fetcher);
    await mount(<ReconciliationScreen />);
    expect(fetcher.mock.calls.some(([, init]) => init?.method)).toBe(false);
    await vi.waitFor(() => expect(button('选择该候选')).toBeDefined());
    await click(button('选择该候选'));
    await input(field('对账原因'), '依据受控回单');
    await click(button('确认对账'));
    const writes = fetcher.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(writes).toHaveLength(1);
    expect(JSON.parse(String(writes[0]![1]?.body))).toMatchObject({
      expectedLedgerRevision: '7',
      reason: '依据受控回单',
      coveredCost: '312.345678',
    });
    expect(field('对账原因').value).toBe('依据受控回单');
    expect(document.body.textContent).toContain('账本版本已变化');
  });
});
