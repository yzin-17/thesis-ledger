import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportCsv } from '../../src/platform/output/export-file';

const native = vi.hoisted(() => ({ write: vi.fn(), share: vi.fn(), available: vi.fn() }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  File: class {
    uri: string;
    constructor(path: string, name: string) {
      this.uri = path + name;
    }
    write(value: string) {
      native.write(value);
    }
  },
}));
vi.mock('expo-sharing', () => ({ isAvailableAsync: native.available, shareAsync: native.share }));
beforeEach(() => {
  vi.resetAllMocks();
  native.available.mockResolvedValue(true);
});

describe('CSV 原生输出', () => {
  it('原样传递编码与十进制文本，分享取消后仍可再次调用', async () => {
    const csv = '\uFEFF日期,权益\r\n2026-10-22,123.00000001\r\n';
    native.share.mockResolvedValue(undefined);
    await exportCsv('equity.csv', csv);
    expect(native.write).toHaveBeenCalledWith(csv);
    expect(native.share).toHaveBeenCalledWith(
      'file:///cache/equity.csv',
      expect.objectContaining({ mimeType: 'text/csv' }),
    );
    await exportCsv('equity.csv', csv);
    expect(native.share).toHaveBeenCalledTimes(2);
  });
  it('系统不可用或分享失败可重试，非法文件名不写文件', async () => {
    await expect(exportCsv('../equity.csv', 'x')).rejects.toThrow('文件名');
    expect(native.write).not.toHaveBeenCalled();
    native.available.mockResolvedValueOnce(false);
    await expect(exportCsv('equity.csv', 'x')).rejects.toThrow('不能打开');
    native.share.mockRejectedValueOnce(new Error('系统分享失败')).mockResolvedValueOnce(undefined);
    await expect(exportCsv('equity.csv', 'x')).rejects.toThrow('系统分享失败');
    await expect(exportCsv('equity.csv', 'x')).resolves.toBeUndefined();
  });
});
