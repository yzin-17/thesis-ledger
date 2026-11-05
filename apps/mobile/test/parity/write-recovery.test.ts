import { describe, it, expect, vi } from 'vitest';
import { performMobileWrite } from '../../src/app/query/perform-write';
describe('手机写入与重读边界', () => {
  it('写入成功、重读失败仍返回成功事实，不能诱导重写', async () => {
    const execute = vi.fn().mockResolvedValue({ eventId: 'created' });
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(performMobileWrite({ online: true, execute, refresh })).resolves.toEqual({
      result: { eventId: 'created' },
      refreshFailed: true,
    });
    expect(execute).toHaveBeenCalledOnce();
  });
  it('离线不接受命令，写入失败不伪造成功或刷新', async () => {
    const execute = vi.fn().mockRejectedValue(new Error('conflict'));
    const refresh = vi.fn();
    await expect(performMobileWrite({ online: false, execute, refresh })).rejects.toThrow('离线');
    expect(execute).not.toHaveBeenCalled();
    await expect(performMobileWrite({ online: true, execute, refresh })).rejects.toThrow(
      'conflict',
    );
    expect(refresh).not.toHaveBeenCalled();
  });
});
