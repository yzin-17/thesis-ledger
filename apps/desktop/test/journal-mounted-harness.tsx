import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, vi } from 'vitest';
import { journalReviewCandidateContractSchema } from '@thesis-ledger/schemas';
import { journalUiEvidenceFixture } from './journal-review.fixture.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const mounts: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of mounts.splice(0)) await cleanup();
});

export function journalMountedCandidate() {
  const input = journalUiEvidenceFixture();
  return journalReviewCandidateContractSchema.parse({
    input,
    openedAt: input.trade.openedAt,
    effectiveClosedAt: input.trade.closedAt,
    executedAt: null,
    reviewStatus: 'CURRENT',
    missingEvidence: [],
    statisticsEligibility: { eligible: true, reasons: [] },
  });
}

export async function mountJournal(node: ReactNode) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const render = (next: ReactNode) =>
    act(async () => {
      root.render(<QueryClientProvider client={client}>{next}</QueryClientProvider>);
    });
  await render(node);
  let disposed = false;
  const dispose = async () => {
    if (disposed) return;
    disposed = true;
    await act(async () => root.unmount());
    client.clear();
    host.remove();
  };
  mounts.push(dispose);
  return { host, client, render, dispose };
}

export async function journalWait(assert: () => void) {
  await vi.waitFor(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert();
  });
}

export function journalButton(label: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (row) => row.textContent === label,
  );
  expect(button, `按钮 ${label}`).toBeDefined();
  return button!;
}
export async function journalClick(label: string) {
  await act(async () => journalButton(label).click());
}
export async function journalFill(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);
  expect(input, `输入 ${label}`).not.toBeNull();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input!.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export function journalDeferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
