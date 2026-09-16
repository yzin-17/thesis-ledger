import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn() },
}));

import {
  createMobileMarketColorPersistence,
  defaultMobileMarketColorScheme,
  normalizeMobileMarketColorScheme,
  mobileMarketColorStorageKey,
} from '../src/market-color.js';
import { getMobileTheme } from '../src/theme.js';

describe('Mobile 涨跌配色契约', () => {
  it('非法值回退红涨绿跌并使用固定存储 key', () => {
    expect(defaultMobileMarketColorScheme).toBe('red-up');
    expect(normalizeMobileMarketColorScheme(undefined)).toBe('red-up');
    expect(normalizeMobileMarketColorScheme('unknown')).toBe('red-up');
    expect(normalizeMobileMarketColorScheme('green-up')).toBe('green-up');
    expect(mobileMarketColorStorageKey).toBe('thesis-ledger-market-color-scheme');
  });

  it('切换只交换金融颜色，不改变成功和错误颜色', () => {
    const redUp = getMobileTheme('light', 'red-up');
    const greenUp = getMobileTheme('light', 'green-up');
    expect(redUp.marketUp).toBe(redUp.negative);
    expect(redUp.marketDown).toBe(redUp.positive);
    expect(greenUp.marketUp).toBe(redUp.marketDown);
    expect(greenUp.marketDown).toBe(redUp.marketUp);
    expect(greenUp.positive).toBe(redUp.positive);
    expect(greenUp.error).toBe(redUp.error);
  });

  it('用户选择发生后忽略尚未完成的旧读取', async () => {
    let resolveRead: ((value: string | null) => void) | undefined;
    const storage = {
      getItem: vi.fn(
        () =>
          new Promise<string | null>((resolve) => {
            resolveRead = resolve;
          }),
      ),
      setItem: vi.fn(async () => undefined),
    };
    const persistence = createMobileMarketColorPersistence(storage);
    const restore = persistence.restore();

    await persistence.save('green-up');
    resolveRead?.('red-up');

    await expect(restore).resolves.toBeNull();
  });

  it('串行保存连续选择，并在前一次失败后继续写入最后选择', async () => {
    const writes: string[] = [];
    let rejectFirst: ((error: Error) => void) | undefined;
    const storage = {
      getItem: vi.fn(async () => null),
      setItem: vi
        .fn()
        .mockImplementationOnce(
          (_key: string, value: string) =>
            new Promise<void>((_resolve, reject) => {
              writes.push(value);
              rejectFirst = reject;
            }),
        )
        .mockImplementationOnce(async (_key: string, value: string) => {
          writes.push(value);
        }),
    };
    const persistence = createMobileMarketColorPersistence(storage);

    const first = persistence.save('green-up');
    const second = persistence.save('red-up');
    await Promise.resolve();
    expect(writes).toEqual(['green-up']);
    rejectFirst?.(new Error('write failed'));

    await expect(first).rejects.toThrow('write failed');
    await expect(second).resolves.toBeUndefined();
    expect(writes).toEqual(['green-up', 'red-up']);
  });
});
