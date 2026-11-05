// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider, keepPreviousData } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  researchReportComparisonSchema,
  type ResearchReportComparison,
  type ResearchReportComparisonInput,
  type ResearchReportSummary,
} from '@thesis-ledger/schemas';
import { ResearchComparison } from '../src/features/ai/ResearchComparison.js';
import { researchComparisonChoiceLabel } from '../src/features/ai/research-comparison-display.js';
import { researchKeys } from '../src/features/ai/research.queries.js';
import { setIdentitySession } from '../src/shared/api/identity-session.js';

const api = vi.hoisted(() => ({
  compare:
    vi.fn<
      (
        id: string,
        query: ResearchReportComparisonInput,
        signal?: AbortSignal,
      ) => Promise<ResearchReportComparison>
    >(),
  evidence: vi.fn(),
  submit: vi.fn(),
}));
vi.mock('../src/shared/api/client.js', () => ({ getDesktopApiClient: () => ({ research: api }) }));
const raw = JSON.parse(
  readFileSync('../../packages/schemas/fixtures/research-comparison.samples.json', 'utf8'),
);
const sample = () => researchReportComparisonSchema.parse(structuredClone(raw));
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mounted = false;
async function mount(
  report: ResearchReportSummary = sample().current,
  contextKey = 'shadow:instrument',
) {
  if (!mounted) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, placeholderData: keepPreviousData } },
    });
    mounted = true;
  }
  const previous = sample().previous!;
  await act(async () =>
    root.render(
      <QueryClientProvider client={client}>
        <ResearchComparison report={report} contextKey={contextKey} choices={[previous]} />
      </QueryClientProvider>,
    ),
  );
}
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
async function wait(check: () => void) {
  await vi.waitFor(async () => {
    await tick();
    check();
  });
}
async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === label,
  );
  expect(button, label).toBeDefined();
  await act(async () => button!.click());
}
beforeEach(() => {
  vi.resetAllMocks();
  setIdentitySession(null);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
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
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent: () => true,
  }));
  api.compare.mockImplementation(async (_id, query) => ({
    ...sample(),
    selection: query.beforeId ? 'explicit' : 'default',
  }));
  api.evidence.mockImplementation(() => new Promise(() => {}));
});
afterEach(async () => {
  if (mounted) {
    await act(async () => root.unmount());
    client.clear();
    host.remove();
    mounted = false;
  }
  setIdentitySession(null);
  vi.unstubAllGlobals();
});

it('在已有详情内按需比较，标签不激活控件，回显与选项复用中文文案', async () => {
  await mount();
  expect(api.compare).not.toHaveBeenCalled();
  await click('比较已存报告');
  await wait(() => expect(host.textContent).toContain('受控比较后的研究文字。'));
  const trigger = host.querySelector<HTMLButtonElement>('[role="combobox"]')!;
  expect(trigger.textContent).toContain('默认前序');
  await act(async () => host.querySelector('label')!.click());
  expect(trigger.getAttribute('aria-expanded')).not.toBe('true');
  await act(async () => trigger.click());
  const label = researchComparisonChoiceLabel(sample().previous!);
  await wait(() =>
    expect(
      [...document.querySelectorAll('[role="option"]')].some((option) =>
        option.textContent?.includes(label),
      ),
    ).toBe(true),
  );
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((item) =>
    item.textContent?.includes(label),
  )!;
  await act(async () => {
    option.focus();
    option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await wait(() => expect(api.compare).toHaveBeenCalledTimes(2));
  expect(api.compare.mock.calls[1]![1].beforeId).toBe(sample().previous!.id);
  expect(trigger.textContent).toContain(label);
  expect(trigger.textContent).not.toContain(sample().previous!.id);
  expect(api.submit).not.toHaveBeenCalled();
});

it('前后证据入口绑定各自报告与引用，未变字段不会标为变化', async () => {
  await mount();
  await click('比较已存报告');
  await wait(() => expect(host.textContent).toContain('受控比较后的研究文字。'));
  await click('前一份报告证据 1');
  await click('当前报告证据 1');
  const value = sample();
  expect(api.evidence.mock.calls[0]![0]).toBe(value.previous!.id);
  expect(api.evidence.mock.calls[0]![1]).toBe(
    value.evidence.find((entry) => entry.before.length)!.before[0]!.evidenceId,
  );
  expect(api.evidence.mock.calls[1]![0]).toBe(value.current.id);
  expect(api.evidence.mock.calls[1]![1]).toBe(
    value.evidence.find((entry) => entry.after.length)!.after[0]!.evidenceId,
  );
  await click('显示未变字段');
  const model = host.querySelector('[role="region"][aria-label="Prompt 与模型"]')!;
  expect(
    [...model.querySelectorAll('[data-slot="badge"]')].every(
      (badge) => badge.textContent === '未变',
    ),
  ).toBe(true);
});

it('重新读取失去权限时隐藏已缓存比较，不回显旧正文', async () => {
  await mount();
  await click('比较已存报告');
  await wait(() => expect(host.textContent).toContain('受控比较后的研究文字。'));
  api.compare.mockRejectedValueOnce(new Error('controlled permission denied'));
  await act(async () => {
    await client.invalidateQueries({ queryKey: researchKeys.root });
  });
  await wait(() => expect(host.textContent).toContain('比较暂不可用'));
  expect(host.textContent).not.toContain('受控比较后的研究文字。');
});

it.each(['object', 'mode'] as const)(
  '切换 %s 重置选择并取消旧读取，晚到响应不覆盖新范围',
  async (context) => {
    let resolve!: (value: ResearchReportComparison) => void;
    api.compare.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await mount();
    await click('比较已存报告');
    await tick();
    const signal = api.compare.mock.calls[0]![2];
    const next = sample().current;
    if (context === 'object') {
      next.id = '00000000-0000-4000-8000-000000000100';
      if (
        next.historicalScope.status === 'known' &&
        next.historicalScope.snapshot.scope === 'instrument'
      ) {
        next.historicalScope.snapshot.instrument.instrumentId =
          '00000000-0000-4000-8000-000000000101';
        next.historicalScope.snapshot.instrument.symbol = '000001.SZ';
      }
    } else if (next.historicalScope.status === 'known')
      next.historicalScope.snapshot.mode = 'actual';
    await mount(next, context === 'mode' ? 'actual:instrument' : 'shadow:account');
    expect(signal?.aborted).toBe(true);
    expect(host.textContent).not.toContain('受控比较后的研究文字。');
    expect(host.textContent).toContain('比较已存报告');
    await act(async () => resolve({ ...sample(), selection: 'default' }));
    await tick();
    expect(host.textContent).not.toContain('受控比较后的研究文字。');
  },
);

it('身份变化不复用前一主体的比较或选择', async () => {
  await mount();
  await click('比较已存报告');
  await wait(() => expect(host.textContent).toContain('受控比较后的研究文字。'));
  await act(async () =>
    setIdentitySession({
      token: 'r'.repeat(43),
      expiresAt: '2030-01-01T00:00:00Z',
      principal: {
        id: 'a1111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        username: 'reader',
        displayName: '受控读者',
      },
    }),
  );
  expect(host.textContent).not.toContain('受控比较后的研究文字。');
  expect(host.textContent).toContain('比较已存报告');
  expect(api.compare).toHaveBeenCalledTimes(1);
});
