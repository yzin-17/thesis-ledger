import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { afterEach, beforeEach, vi } from 'vitest';
import { ThesisLedgerApiClient } from '@thesis-ledger/api-client';
import { createMobileQueryClient } from '../../src/app/query/query-client';

const sharedView = vi.hoisted(() => ({
  params: {} as Record<string, unknown>,
  runtime: {} as Record<string, unknown>,
  confirm: vi.fn(),
  notice: vi.fn(),
  dirty: vi.fn(),
  navigate: vi.fn(),
  image: vi.fn(),
  document: vi.fn(),
}));
export const view = sharedView;
vi.mock('../../src/app/MobileRuntime', () => ({
  useMobileRuntime: () => view.runtime,
  useDirtyForm: view.dirty,
  confirmAction: view.confirm,
  showMessage: view.notice,
}));
vi.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: view.params }),
  useNavigation: () => ({ navigate: view.navigate }),
}));
vi.mock('../../src/platform/files/select-file', () => ({
  selectImage: view.image,
  selectDocument: view.document,
}));
vi.mock('expo-crypto', async () => {
  const { createHash, randomUUID } = await import('node:crypto');
  return {
    randomUUID,
    CryptoDigestAlgorithm: { SHA256: 'SHA256' },
    digestStringAsync: async (_algorithm: string, value: string) =>
      createHash('sha256').update(value).digest('hex'),
  };
});
vi.mock('expo-file-system', () => ({
  File: class {
    bytes() {
      return Promise.resolve(new Uint8Array(4));
    }
  },
}));
vi.mock('../../src/components/MobilePrimitives', async () => {
  const React = await import('react');
  const e = React.createElement;
  const failureMessage = (error: unknown) => {
    if (error && typeof error === 'object' && 'payload' in error)
      return (error.payload as { message?: string })?.message ?? '请求失败';
    return error instanceof Error ? error.message : '操作失败';
  };
  return {
    failureMessage,
    Page: ({
      title,
      children,
      action,
    }: {
      title: string;
      children: ReactNode;
      action?: ReactNode;
    }) => e('main', {}, e('h1', {}, title), action, children),
    Section: ({ title, children }: { title?: string; children: ReactNode }) =>
      e('section', {}, title, children),
    Copy: ({ children }: { children: ReactNode }) => e('p', {}, children),
    Action: ({
      label,
      disabled,
      onPress,
    }: {
      label: string;
      disabled?: boolean;
      onPress: () => void;
    }) => e('button', { disabled, onClick: onPress }, label),
    Field: ({
      label,
      value,
      editable,
      onChange,
    }: {
      label: string;
      value: string;
      editable?: boolean;
      onChange: (value: string) => void;
    }) =>
      e('input', {
        'aria-label': label,
        value,
        disabled: editable === false,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => onChange(event.target.value),
      }),
    Choices: ({
      label,
      options,
      value,
      disabled,
      onChange,
    }: {
      label: string;
      options: Array<{ value: string; label: string }>;
      value: string;
      disabled?: boolean;
      onChange: (value: string) => void;
    }) =>
      e(
        'div',
        { 'aria-label': label },
        options.map((option) =>
          e(
            'button',
            {
              key: option.value,
              disabled,
              'aria-pressed': value === option.value,
              onClick: () => onChange(option.value),
            },
            option.label,
          ),
        ),
      ),
    Feedback: ({ message }: { message?: string }) =>
      message ? e('p', { role: 'status' }, message) : null,
    QueryStatus: ({
      query,
      retry,
    }: {
      query: { isError: boolean; isPending: boolean; error: unknown };
      retry: () => void;
    }) =>
      query.isError
        ? e('div', {}, failureMessage(query.error), e('button', { onClick: retry }, '重新读取'))
        : null,
  };
});

const cleanups: Array<() => void> = [];
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  onlineManager.setOnline(true);
  view.params = {};
  view.runtime = {
    mode: 'shadow',
    scope: ['mobile-v2', 'https://ledger.test/api/v1', 'shadow', 'all'],
    accountId: null,
    changeAccount: vi.fn().mockResolvedValue(true),
  };
  view.confirm.mockResolvedValue(true);
});
afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
  vi.unstubAllGlobals();
});
export function setApi(fetcher: typeof fetch) {
  view.runtime.api = new ThesisLedgerApiClient('https://ledger.test/api/v1', fetcher);
}
export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 25));
  });
}
export async function mount(content: ReactNode) {
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const client = createMobileQueryClient();
  client.setDefaultOptions({ queries: { retry: false, gcTime: 0 } });
  await act(async () =>
    root.render(<QueryClientProvider client={client}>{content}</QueryClientProvider>),
  );
  cleanups.push(() => {
    act(() => root.unmount());
    client.clear();
    node.remove();
  });
  await flush();
  return client;
}
export const button = (text: string) =>
  [...document.querySelectorAll('button')].find((element) => element.textContent === text)!;
export const field = (label: string) =>
  document.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;
export async function click(element: HTMLElement) {
  await act(async () => element.click());
  await flush();
}
export async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
