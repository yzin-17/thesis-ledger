import { describe, it, expect, vi } from 'vitest';
import { guardedTransition, mobileScopeKey } from '../../src/app/navigation-state';
describe('手机上下文切换保护', () => {
  it('保存中不切换，取消不丢稿，确认后先清稿再切换', async () => {
    const calls: string[] = [];
    const options = {
      pending: false,
      dirty: true,
      confirm: vi.fn().mockResolvedValue(false),
      discard: () => calls.push('discard'),
      change: () => calls.push('change'),
    };
    expect(await guardedTransition({ ...options, pending: true })).toBe(false);
    expect(options.confirm).not.toHaveBeenCalled();
    expect(await guardedTransition(options)).toBe(false);
    expect(calls).toEqual([]);
    options.confirm.mockResolvedValue(true);
    expect(await guardedTransition(options)).toBe(true);
    expect(calls).toEqual(['discard', 'change']);
  });
  it('服务、范围与账户都参与缓存身份', () => {
    const keys = [
      mobileScopeKey('https://a', 'actual'),
      mobileScopeKey('https://a', 'shadow'),
      mobileScopeKey('https://b', 'actual'),
      mobileScopeKey('https://a', 'actual', 'account'),
    ];
    expect(new Set(keys.map((key) => JSON.stringify(key))).size).toBe(4);
  });
});
