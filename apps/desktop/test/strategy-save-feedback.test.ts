import { describe, expect, it, vi } from 'vitest';
import { createStrategyActionHandlers } from '../src/features/strategy/strategy.actions.js';

function setup(load: () => Promise<unknown>) {
  const add = vi.fn();
  const create = vi.fn().mockResolvedValue({ id: 'strategy-1' });
  const actions = createStrategyActionHandlers({
    name: '策略',
    schemaText: '{}',
    busyAction: null,
    setBusyAction: vi.fn(),
    toastManager: { add },
    createMutation: { mutateAsync: create },
    fetchBarsMutation: { mutateAsync: vi.fn() },
    queueMutation: { mutateAsync: vi.fn() },
    runMutation: { mutateAsync: vi.fn() },
    cancelMutation: { mutateAsync: vi.fn() },
    load,
  });
  return { actions, add, create };
}

describe('策略保存反馈', () => {
  it('列表刷新失败时仍报告写入成功，避免再次创建策略', async () => {
    const { actions, add, create } = setup(() => Promise.reject(new Error('offline')));
    expect(await actions.createStrategy({ name: '策略', schema: {} })).toBe(true);
    expect(create).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ title: '保存已完成，列表刷新失败' }),
    );
    expect(add).not.toHaveBeenCalledWith(expect.objectContaining({ title: '策略创建失败' }));
  });

  it('刷新完成前不返回可关闭编辑器的成功结果', async () => {
    let resolveRefresh!: () => void;
    const refresh = new Promise<void>((resolve) => {
      resolveRefresh = resolve;
    });
    const { actions } = setup(() => refresh);
    const settled = vi.fn();
    const saving = actions.createStrategy({ name: '策略', schema: {} }).then(settled);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).not.toHaveBeenCalled();
    resolveRefresh();
    await saving;
    expect(settled).toHaveBeenCalledWith(true);
  });
});
