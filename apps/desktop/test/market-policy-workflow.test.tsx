// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useMarketPolicyWorkflow } from '../src/features/market-data/useMarketPolicyWorkflow.js';
import { catalog, key, policy, provider, target } from './market-policy-defaults.fixture.js';

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

describe('来源配置草稿生命周期', () => {
  it('目录到达及凭证刷新均不填来源、不触发保存', async () => {
    await render({ catalog: undefined, catalogComplete: false });
    expect(workflow.draft?.routes).toEqual([]);
    await render();
    await render({ providers: [{ ...provider, credentialConfigured: false }] });
    expect(workflow.draft?.routes).toEqual([]);
    expect(workflow.dirty).toBe(false);
    expect(mutations.save).not.toHaveBeenCalled();
  });
  it('显式配置后提交兼容字段，保存成功接受新修订', async () => {
    await render();
    const next = { ...workflow.draft!, routes: [{ key, targets: [target], enabled: true }] };
    await act(async () => workflow.changeDraft(next));
    expect(workflow.dirty).toBe(true);
    mutations.save.mockResolvedValue({ ...policy, ...next, revision: 5 });
    await act(async () => workflow.save());
    expect(mutations.save).toHaveBeenCalledWith(next);
    expect(workflow.dirty).toBe(false);
    expect(workflow.draft?.revision).toBe(5);
  });
  it('清空并保存后目录及页面重读均不回填', async () => {
    const configured = { ...policy, enabled: true, routes: [{ key, targets: [target], enabled: true }] };
    await render({ policy: configured });
    await act(async () => workflow.changeDraft({ ...workflow.draft!, routes: [] }));
    await render({ catalog: { ...catalog, catalogRevision: 10 }, policy: { ...configured } });
    expect(workflow.draft?.routes).toEqual([]);
    expect(workflow.dirty).toBe(true);
    mutations.save.mockResolvedValue({ ...configured, revision: 5, routes: [] });
    await act(async () => workflow.save());
    expect(mutations.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true, routes: [] }));
    expect(workflow.dirty).toBe(false);
    expect(workflow.draft?.routes).toEqual([]);
  });
  it('提交失败保留用户来源，恢复原值后不再标为已修改', async () => {
    await render();
    await act(async () => workflow.changeDraft({ ...workflow.draft!, routes: [{ key, targets: [target], enabled: true }] }));
    mutations.save.mockRejectedValue(new Error('受控失败'));
    await act(async () => workflow.save());
    expect(workflow.dirty).toBe(true);
    expect(workflow.draft?.routes[0]?.targets).toEqual([target]);
    await act(async () => workflow.changeDraft({ ...workflow.draft!, routes: [] }));
    expect(workflow.dirty).toBe(false);
  });
});
