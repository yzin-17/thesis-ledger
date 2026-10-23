// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, field, input, mount, setApi, view } from './mobile-view-harness';
import { DraftReviewScreen } from '../../src/features/import-review/DraftReviewScreen';
import { reviewAccountId as accountId, reviewDraft } from './review-fixture';

const account = {
  id: accountId,
  name: '受控模拟账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: true,
};
function setup(scope: 'PARTIAL' | 'FULL' = 'PARTIAL') {
  let draft = structuredClone(reviewDraft);
  draft.review!.scope = scope;
  let ledgerRevision = '7';
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/accounts')) return Response.json([account]);
    if (url.pathname.endsWith('/events'))
      return Response.json({
        accountId,
        ledgerRevision,
        projectionGeneration: '1',
        events: [],
        effective: true,
        instrumentDirectory: { generation: 1, items: [], unresolvedSymbols: [] },
      });
    if (url.pathname.endsWith('/imports/review')) return Response.json([draft]);
    const command = JSON.parse(String(init?.body));
    if (command.command === 'REVISE_IMPORT_DRAFT') {
      draft = { ...draft, review: { ...draft.review!, revision: 2, rows: command.rows } };
      return Response.json({
        draftId: draft.id,
        revision: 2,
        rowIds: command.rows.map((row: { rowId: string }) => row.rowId),
      });
    }
    if (command.command === 'SUBMIT_IMPORT_DRAFT_REVISION') {
      ledgerRevision = '8';
      draft = {
        ...draft,
        status: 'partial',
        review: { ...draft.review!, frozenRowIds: command.selectedRowIds },
      };
      return Response.json({
        eventIds: ['00000000-0000-4000-8000-000000000003'],
        factIds: ['00000000-0000-4000-8000-000000000004'],
        ledgerRevisions: { [accountId]: ledgerRevision },
        projectionGenerations: { [accountId]: '2' },
        affectedSymbols: ['510300.SH'],
        idempotentReplay: false,
      });
    }
    throw new Error('未预期的请求');
  });
  view.params = { accountId, draftId: draft.id };
  setApi(fetcher);
  return { fetcher, draft: () => draft };
}
describe('手机草稿保存与选行提交', () => {
  it('读取不写入也不自动选行；修改必须先保存，保存后重新选择且只提交所选行', async () => {
    const { fetcher } = setup();
    await mount(<DraftReviewScreen />);
    await vi.waitFor(() => expect(button('提交所选 0 行')?.disabled).toBe(true));
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
    await input(field('第 1 行数量'), '200');
    expect(button('选择第 1 行').disabled).toBe(true);
    await click(button('保存草稿修订'));
    expect(button('提交所选 0 行').disabled).toBe(true);
    await click(button('选择第 1 行'));
    await click(button('提交所选 1 行'));
    const commands = fetcher.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([, init]) => JSON.parse(String(init?.body)));
    expect(commands.map((command) => command.command)).toEqual([
      'REVISE_IMPORT_DRAFT',
      'SUBMIT_IMPORT_DRAFT_REVISION',
    ]);
    expect(commands[0]).toMatchObject({
      expectedRevision: 1,
      rawEvidenceRef: 'controlled://mobile-review',
      rows: [{ rowId: 'row-0', quantity: '200' }, { rowId: 'row-1' }],
    });
    expect(commands[1]).toMatchObject({
      revision: 2,
      expectedLedgerRevision: '7',
      selectedRowIds: ['row-0'],
    });
  });
  it('完整快照提交前确认，取消保持所选行和原草稿', async () => {
    const { fetcher } = setup('FULL');
    await mount(<DraftReviewScreen />);
    await vi.waitFor(() => expect(button('选择第 1 行')?.disabled).toBe(false));
    await click(button('选择第 1 行'));
    view.confirm.mockResolvedValueOnce(false);
    await click(button('提交所选 1 行'));
    expect(view.confirm).toHaveBeenCalledWith(
      '提交完整持仓快照？',
      expect.stringContaining('归零'),
      true,
    );
    expect(fetcher.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(button('提交所选 1 行').disabled).toBe(false);
  });
});
