import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screenshotBody } from '../../src/platform/files/picked-file';
import { selectDocument, selectImage } from '../../src/platform/files/select-file';
import { installFormDataPatch } from '../../node_modules/expo/src/winter/FormData';
import { convertFormDataAsync } from '../../node_modules/expo/src/winter/fetch/convertFormData';

const pickers = vi.hoisted(() => ({ permission: vi.fn(), image: vi.fn(), document: vi.fn() }));
const files = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('expo-file-system', () => ({
  File: class {
    constructor(readonly uri: string) {}
    bytes() {
      return files.read(this.uri);
    }
  },
}));
vi.mock('../../node_modules/expo/src/utils/blobUtils', () => ({
  blobToArrayBufferAsync: (blob: Blob) => blob.arrayBuffer(),
}));
vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: pickers.permission,
  launchImageLibraryAsync: pickers.image,
}));
vi.mock('expo-document-picker', () => ({ getDocumentAsync: pickers.document }));
beforeEach(() => vi.resetAllMocks());

function nativeFormData() {
  class ReactNativeFormData {
    _parts: unknown[] = [];
  }
  return installFormDataPatch(ReactNativeFormData as unknown as typeof FormData);
}

describe('原生文件选择与上传边界', () => {
  it('系统选择失败或取消不伪造文件，恢复后保留 URI，且不请求整库权限', async () => {
    pickers.permission.mockResolvedValue({ granted: false });
    pickers.image.mockRejectedValueOnce(new Error('permission denied'));
    await expect(selectImage()).rejects.toThrow('照片选择器');
    pickers.image.mockResolvedValueOnce({ canceled: true, assets: null }).mockResolvedValueOnce({
      canceled: false,
      assets: [
        { uri: 'file:///cache/a.png', fileName: '持仓.png', mimeType: 'image/png', fileSize: 12 },
      ],
    });
    expect(await selectImage()).toBeNull();
    expect(await selectImage()).toEqual({
      uri: 'file:///cache/a.png',
      name: '持仓.png',
      mimeType: 'image/png',
      size: 12,
    });
    expect(pickers.permission).not.toHaveBeenCalled();
    pickers.document.mockResolvedValue({ canceled: true, assets: null });
    expect(await selectDocument()).toBeNull();
  });
  it('使用当前 Expo 编码器读取原生 URI，保留文件名、MIME 和二进制', async () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    files.read.mockResolvedValue(bytes);
    vi.stubGlobal('FormData', nativeFormData());
    try {
      const body = screenshotBody(
        { uri: 'content://images/12', name: '持仓.png', mimeType: 'image/png' },
        'account-1',
        'unknown',
      );
      const encoded = await convertFormDataAsync(body, 'native-test-boundary');
      expect(files.read).toHaveBeenCalledWith('content://images/12');
      expect(body.get('accountId')).toBe('account-1');
      expect(body.get('sourceConfidence')).toBe('0');
      expect(body.get('extracted')).toBe('[]');
      const text = new TextDecoder().decode(encoded.body);
      expect(text).toContain('filename="%E6%8C%81%E4%BB%93.png"');
      expect(text).toContain('content-type: image/png');
      expect(text).toContain('--native-test-boundary');
      expect(
        encoded.body.some((_, index) =>
          bytes.every((byte, offset) => encoded.body[index + offset] === byte),
        ),
      ).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it('文件缺失或不可读时停止上传，不伪造文件内容', async () => {
    expect(() =>
      screenshotBody({ uri: '', name: 'x', mimeType: 'image/png' }, 'account-1', 'unknown'),
    ).toThrow('文件信息不完整');
    expect(files.read).not.toHaveBeenCalled();
    files.read.mockRejectedValueOnce(new Error('文件已不可读'));
    vi.stubGlobal('FormData', nativeFormData());
    try {
      await expect(
        convertFormDataAsync(
          screenshotBody(
            { uri: 'file:///gone.png', name: 'x.png', mimeType: 'image/png' },
            'account-1',
            'broker',
          ),
        ),
      ).rejects.toThrow('文件已不可读');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
