import { describe, expect, it, vi } from 'vitest';
import {
  checkConnection,
  connectionPersistence,
  normalizeConnection,
} from '../../src/platform/connection/connection';

describe('手机服务连接', () => {
  it('归一化地址，并保留显式的 API 路径', () => {
    expect(normalizeConnection(' https://ledger.test/ ')).toBe('https://ledger.test/api/v1');
    expect(normalizeConnection('http://10.0.2.2:3000/api/v1/')).toBe('http://10.0.2.2:3000/api/v1');
    expect(normalizeConnection('https://ledger.test/custom/api/')).toBe(
      'https://ledger.test/custom/api',
    );
  });
  it.each([
    'file:///tmp/a',
    'javascript:alert(1)',
    'https://user:secret@ledger.test',
    'https://ledger.test?key=x',
    'https://ledger.test/#x',
    'localhost:3000',
  ])('拒绝错误或敏感地址 %s', (value) => {
    expect(() => normalizeConnection(value)).toThrow();
  });
  it('用户已保存新地址时，晚到的本地恢复不能覆盖它', async () => {
    let resolve!: (value: string) => void;
    const getItem = vi.fn(
      () =>
        new Promise<string>((done) => {
          resolve = done;
        }),
    );
    const setItem = vi.fn().mockResolvedValue(undefined);
    const persistence = connectionPersistence({ getItem, setItem });
    const restoration = persistence.restore();
    await persistence.save('https://new.test');
    resolve('https://old.test');
    expect(await restoration).toBeNull();
    expect(setItem).toHaveBeenCalledWith(
      'thesis-ledger-mobile-connection-v1',
      'https://new.test/api/v1',
    );
  });
  it('错误健康响应不能被当作连接成功', async () => {
    await expect(
      checkConnection('https://ledger.test', vi.fn().mockResolvedValue(new Response('{}'))),
    ).rejects.toThrow('健康状态');
    await expect(
      checkConnection(
        'https://ledger.test',
        vi.fn().mockResolvedValue(new Response('{}', { status: 503 })),
      ),
    ).rejects.toThrow('503');
    expect(
      await checkConnection(
        'https://ledger.test',
        vi.fn().mockResolvedValue(Response.json({ status: 'healthy', service: 'thesis-ledger' })),
      ),
    ).toBe('https://ledger.test/api/v1');
  });
});
