// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketPolicyWorkflow } from '../src/features/market-data/useMarketPolicyWorkflow.js';
import { catalog, draft, key, policy, provider, target } from './market-policy-defaults.fixture.js';

const mutations = vi.hoisted(() => ({ save: vi.fn(), retry: vi.fn() }));
vi.mock('../src/features/market-data/market-data.mutations.js', () => ({
  useSaveMarketPolicyMutation: () => ({ mutateAsync: mutations.save, isPending: false }),
  useRetryMarketPolicyMutation: () => ({ mutateAsync: mutations.retry, isPending: false }),
}));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement | undefined;
let workflow: ReturnType<typeof useMarketPolicyWorkflow>;
type Inputs = Parameters<typeof useMarketPolicyWorkflow>[0];
const setBusyAction = vi.fn();
const setMessage = vi.fn();

function Harness(props: Inputs) {
  workflow = useMarketPolicyWorkflow(props);
  return null;
}
async function render(overrides: Partial<Inputs> = {}) {
  if (!host) {
    host = document.createElement('div');
    root = createRoot(host);
  }
  await act(async () =>
    root.render(
      <Harness
        policy={policy}
        catalog={catalog}
        providers={[provider]}
        catalogComplete
        setBusyAction={setBusyAction}
        setMessage={setMessage}
        {...overrides}
      />,
    ),
  );
}
afterEach(async () => {
  await act(async () => root?.unmount());
  host = undefined;
  vi.clearAllMocks();
});

describe('默认主源草稿生命周期', () => {
  it('目录异步到达时填写 HiThink，并等待用户保存', async () => {
    await render({ catalog: undefined, catalogComplete: false });
    expect(workflow.draft?.routes).toEqual([]);
    await render();
    expect(workflow.draft?.routes).toEqual([{ key, targets: [target] }]);
    expect(workflow.dirty).toBe(true);
    expect(mutations.save).not.toHaveBeenCalled();
    mutations.save.mockResolvedValue({
      ...policy,
      revision: 5,
      routes: [{ key, targets: [target] }],
    });
    await act(async () => workflow.save());
    expect(mutations.save).toHaveBeenCalledWith({ ...draft, routes: [{ key, targets: [target] }] });
    expect(workflow.dirty).toBe(false);
    expect(workflow.draft?.revision).toBe(5);
  });
  it('用户清空后刷新不回填，保存后的空选择也保留', async () => {
    await render();
    await act(async () => workflow.changeDraft({ ...workflow.draft!, routes: [] }));
    await render({ catalog: { ...catalog, catalogRevision: 10 }, policy: { ...policy } });
    expect(workflow.draft?.routes).toEqual([]);
    mutations.save.mockResolvedValue({ ...policy, revision: 5, routes: [] });
    await act(async () => workflow.save());
    expect(workflow.draft?.routes).toEqual([]);
    expect(workflow.dirty).toBe(false);
    expect(workflow.draft?.revision).toBe(5);
  });
  it('缺凭证时也先填默认主源，后续配置不改写选择', async () => {
    await render({ providers: [{ ...provider, credentialConfigured: false }] });
    expect(workflow.draft?.routes).toEqual([{ key, targets: [target] }]);
    expect(workflow.dirty).toBe(true);
    await render();
    expect(workflow.draft?.routes).toEqual([{ key, targets: [target] }]);
    expect(workflow.dirty).toBe(true);
  });
});
