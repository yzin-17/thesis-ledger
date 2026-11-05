// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { webcrypto } from 'node:crypto';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImportDraftReviewRecord } from '@thesis-ledger/schemas';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { ImportDraftReview } from '../src/features/import/ImportDraftReview.js';

const api = vi.hoisted(() => ({
  request: vi.fn(),
  revise: vi.fn(),
  submit: vi.fn(),
  toast: vi.fn(),
}));
vi.mock('../src/shared/api/client', async () => {
  const { ThesisLedgerApiClient } = await import('@thesis-ledger/api-client');
  const reads = new ThesisLedgerApiClient('https://ledger.test/api/v1', async (input, init) => {
    const url = new URL(String(input));
    const result = await api.request(url.pathname.replace('/api/v1', '') + url.search, init);
    return new Response(JSON.stringify(result), { status: 200 });
  });
  return {
    getDesktopApiClient: () => ({
      request: api.request,
      imports: reads.imports,
      ledger: { reviseImportDraft: api.revise, submitImportDraftRevision: api.submit },
    }),
  };
});
vi.mock('../src/components/ui/toast', () => ({ useToastManager: () => ({ add: api.toast }) }));
const accountId = '11111111-1111-4111-8111-111111111111';
const draft: ImportDraftReviewRecord = {
  id: '22222222-2222-4222-8222-222222222222',
  accountId,
  source: 'unknown',
  status: 'pending',
  createdAt: '2026-10-21T01:00:00.000Z',
  review: {
    revision: 1,
    parserVersion: 'controlled@1',
    rawEvidenceRef: 'controlled://draft',
    contentHash: 'a'.repeat(64),
    scope: 'PARTIAL',
    observedAt: '2026-10-20',
    capturedAt: '2026-10-21T01:00:00.000Z',
    timePrecision: 'DATE',
    sourceTimezone: 'Asia/Shanghai',
    frozenRowIds: [],
    rows: ['510300.SH', '159919.SZ'].map((symbol, i) => ({
      rowId: `row-${i}`,
      kind: 'POSITION_BASELINE',
      symbol,
      quantity: '1.25',
      averageCost: '4.1',
      currency: 'CNY',
      costIncludesFees: 'UNKNOWN',
      assetType: 'etf',
      issues: [],
    })),
  },
};
let records: ImportDraftReviewRecord[];
const cleanups: Array<() => void> = [];
const flush = async () => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
};
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((el) => el.textContent?.includes(text))!;
const control = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
const click = async (el: HTMLElement) => {
  await act(async () => el.click());
  await flush();
};
const input = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

beforeEach(() => {
  vi.resetAllMocks();
  records = structuredClone([draft]);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('PointerEvent', MouseEvent);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  api.request.mockImplementation(async () => structuredClone(records));
  api.revise.mockImplementation(async (command) => {
    records[0]!.status = 'pending';
    records[0]!.review = { ...records[0]!.review!, revision: 2, rows: command.rows };
    return {
      draftId: draft.id,
      revision: 2,
      rowIds: command.rows.map((row: { rowId: string }) => row.rowId),
    };
  });
  api.submit.mockResolvedValue({ idempotentReplay: false });
});
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.unstubAllGlobals();
});

async function mount(ledgerRevision = '7') {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const busy = vi.fn();
  const changed = vi.fn();
  const readLedger = vi.fn().mockResolvedValue(undefined);
  const render = async (revision = ledgerRevision, ready = true) => {
    await act(async () =>
      root.render(
        <QueryClientProvider client={client}>
          <ConfirmDialogProvider>
            <ImportDraftReview
              accountId={accountId}
              ledgerRevision={revision}
              ledgerReady={ready}
              onDirtyChange={() => {}}
              onBusyChange={busy}
              onPortfolioChanged={changed}
              onReadLedger={readLedger}
            />
          </ConfirmDialogProvider>
        </QueryClientProvider>,
      ),
    );
    await flush();
  };
  cleanups.push(() => {
    act(() => root.unmount());
    client.clear();
    node.remove();
  });
  await render();
  return { render, busy, changed, client, readLedger };
}
async function choose() {
  await click(button('待核对 · 待审核'));
}

describe('草稿修订与冻结', () => {
  it('部分提交后先创建后续修订，只复制未提交行而不再次提交旧行', async () => {
    records[0]!.status = 'partial';
    records[0]!.review!.frozenRowIds = ['row-0'];
    await mount();
    await click(button('待核对 · 部分提交'));
    expect(control('选择第 2 行').getAttribute('aria-disabled')).toBe('true');
    await click(button('创建后续修订'));
    expect(api.revise.mock.calls[0]![0]).toMatchObject({
      expectedRevision: 1,
      rows: [{ rowId: 'row-1', symbol: '159919.SZ' }],
    });
    expect(api.revise.mock.calls[0]![0].rows).toHaveLength(1);
    expect(api.submit).not.toHaveBeenCalled();
    expect(records[0]!.review!.frozenRowIds).toEqual(['row-0']);
  });
  it('人工合并重复行后保存新修订，原证据与未修改原件保留', async () => {
    const second = records[0]!.review!.rows[1]!;
    if (second.kind === 'POSITION_BASELINE') second.symbol = '510300.SH';
    await mount();
    await choose();
    await input(control('第 1 行持仓数量'), '2.5');
    const remove = [...document.querySelectorAll('button')].filter(
      (el) => el.textContent === '移除此行',
    );
    await click(remove[1]!);
    await click(button('保存草稿修订'));
    expect(api.revise.mock.calls[0]![0].rows).toEqual([
      expect.objectContaining({ rowId: 'row-0', quantity: '2.5' }),
    ]);
    expect(api.revise.mock.calls[0]![0].rawEvidenceRef).toBe('controlled://draft');
    expect(draft.review!.rows).toHaveLength(2);
  });
  it.each(['committed', 'cancelled'] as const)('%s 草稿保持只读', async (status) => {
    records[0]!.status = status;
    await mount();
    await click(button(status === 'committed' ? '待核对 · 已提交' : '待核对 · 已取消'));
    expect(control('第 1 行持仓数量').disabled).toBe(true);
    expect(button('保存草稿修订').disabled).toBe(true);
    expect(api.revise).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('缺失业务时点时保留未知并阻止提交', async () => {
    records[0]!.review!.observedAt = null;
    records[0]!.review!.capturedAt = null;
    await mount();
    await choose();
    await click(control('选择第 1 行'));
    expect(button('确认并提交所选 0 行').disabled).toBe(true);
    expect(document.body.textContent).toContain('观察：未知');
    expect(api.submit).not.toHaveBeenCalled();
  });
});

describe('无模型草稿读取与提交', () => {
  it('重新读取同时刷新账本，成功后必须重新选择并采用新版本', async () => {
    const { render, readLedger } = await mount();
    await choose();
    await click(control('选择第 1 行'));
    await click(button('重新读取草稿'));
    expect(readLedger).toHaveBeenCalledOnce();
    expect(document.querySelector('[aria-label="草稿审核"]')).toBeNull();
    await render('8');
    await choose();
    await click(control('选择第 1 行'));
    await click(button('确认并提交所选 1 行'));
    expect(api.submit.mock.calls[0]![0].expectedLedgerRevision).toBe('8');
  });
  it('账本重读失败保留审核和选行，禁止使用旧缓存写入', async () => {
    const { readLedger } = await mount();
    await choose();
    await click(control('选择第 1 行'));
    readLedger.mockRejectedValue(new Error('offline'));
    await click(button('重新读取草稿'));
    expect(control('第 1 行持仓数量').value).toBe('1.25');
    expect(control('选择第 1 行').getAttribute('aria-checked')).toBe('true');
    expect(button('确认并提交所选 1 行').disabled).toBe(true);
    expect(api.submit).not.toHaveBeenCalled();
  });
  it('读取和选择不写入，也不提供上传或自动选行', async () => {
    await mount();
    await choose();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    expect(control('选择第 1 行').getAttribute('aria-checked')).toBe('false');
    expect(button('确认并提交所选').disabled).toBe(true);
    expect(api.revise).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
    expect(api.request).toHaveBeenCalledWith(
      `/imports/review?accountId=${accountId}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });
  it('人工更正先保存修订，稳定行与原时间、证据保留，保存不提交', async () => {
    await mount();
    await choose();
    await input(control('第 1 行持仓数量'), '2.125');
    expect(button('确认并提交所选').disabled).toBe(true);
    await click(button('保存草稿修订'));
    await flush();
    expect(api.revise).toHaveBeenCalledOnce();
    expect(api.submit).not.toHaveBeenCalled();
    const command = api.revise.mock.calls[0]![0];
    expect(command).toMatchObject({
      expectedRevision: 1,
      rawEvidenceRef: 'controlled://draft',
      observedAt: '2026-10-20',
      capturedAt: '2026-10-21T01:00:00.000Z',
      sourceTimezone: 'Asia/Shanghai',
      rows: [
        { rowId: 'row-0', quantity: '2.125' },
        { rowId: 'row-1', quantity: '1.25' },
      ],
    });
    expect(command.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(control('第 1 行持仓数量').value).toBe('2.125');
  });
  it('只提交勾选行并携带当时的账本与草稿版本', async () => {
    const { changed } = await mount();
    await choose();
    await click(control('选择第 1 行'));
    await click(button('确认并提交所选 1 行'));
    expect(api.submit).toHaveBeenCalledWith({
      command: 'SUBMIT_IMPORT_DRAFT_REVISION',
      draftId: draft.id,
      revision: 1,
      expectedLedgerRevision: '7',
      selectedRowIds: ['row-0'],
      actorId: 'desktop-user',
    });
    expect(api.revise).not.toHaveBeenCalled();
    expect(changed).toHaveBeenCalledOnce();
  });
  it('提交失败保留所选行且不自动重试', async () => {
    api.submit.mockRejectedValue(new Error('LEDGER_REVISION_CONFLICT'));
    await mount();
    await choose();
    await click(control('选择第 1 行'));
    await click(button('确认并提交所选 1 行'));
    expect(control('选择第 1 行').getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('提交失败，草稿和所选行已保留');
    expect(api.submit).toHaveBeenCalledOnce();
  });
  it('读取失败即使有旧缓存也禁用写入，并保留审核值', async () => {
    await mount();
    await choose();
    api.request.mockRejectedValue(new Error('offline'));
    await click(button('重新读取草稿'));
    expect(document.body.textContent).toContain('草稿读取失败');
    expect(control('第 1 行持仓数量').value).toBe('1.25');
    expect(button('保存草稿修订').disabled).toBe(true);
    expect(button('确认并提交所选').disabled).toBe(true);
  });
  it('已提交草稿和跨修订已提交行保持冻结', async () => {
    records[0]!.review!.frozenRowIds = ['row-0'];
    await mount();
    await choose();
    expect(control('第 1 行持仓数量').disabled).toBe(true);
    expect(control('选择第 1 行').getAttribute('aria-disabled')).toBe('true');
    expect(control('第 2 行持仓数量').disabled).toBe(false);
    await click(control('选择第 1 行'));
    expect(button('确认并提交所选 0 行').disabled).toBe(true);
  });
  it('草稿缺失修订明确不可审核', async () => {
    records[0]!.review = null;
    await mount();
    await choose();
    expect(document.body.textContent).toContain('草稿缺少可审核修订');
    expect(button('保存草稿修订')).toBeUndefined();
  });
  it('错账户响应作为合同错误阻止显示和写入', async () => {
    records[0]!.accountId = '33333333-3333-4333-8333-333333333333';
    await mount();
    expect(document.body.textContent).toContain('草稿读取失败');
    expect(button('待核对 · 待审核')).toBeUndefined();
  });
  it('重复代码不保存修订，人工输入仍保留', async () => {
    await mount();
    await choose();
    await input(control('第 2 行标准代码'), '510300.SH');
    await click(button('保存草稿修订'));
    expect(api.revise).not.toHaveBeenCalled();
    expect(control('第 2 行标准代码').value).toBe('510300.SH');
    expect(document.body.textContent).toContain('修订保存失败');
  });
  it('账本更新后不得自动采用新版本，重新选择才继续', async () => {
    const { render } = await mount();
    await choose();
    await click(control('选择第 1 行'));
    await render('8');
    expect(button('确认并提交所选 1 行').disabled).toBe(true);
    await choose();
    await click(control('选择第 1 行'));
    await click(button('确认并提交所选 1 行'));
    expect(api.submit.mock.calls[0]![0].expectedLedgerRevision).toBe('8');
  });
  it('完整快照在本次明确确认前不能提交', async () => {
    records[0]!.review!.scope = 'FULL';
    await mount();
    await choose();
    await click(control('选择第 1 行'));
    expect(button('确认并提交所选 1 行').disabled).toBe(true);
    await click(control('确认完整快照遗漏标的归零'));
    expect(button('确认并提交所选 1 行').disabled).toBe(false);
  });
});
