// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { button, click, mount, setApi, view } from './mobile-view-harness';
import { ScreenshotUpload } from '../../src/features/screenshot-import/ScreenshotUpload';

const accountId = '00000000-0000-4000-8000-000000000001';
const file = { uri: 'file:///cache/screenshot.png', name: '截图.png', mimeType: 'image/png' };
describe('截图只上传为草稿', () => {
  it('取消不上传；能力拒绝保留文件，可重试且不触发账本命令', async () => {
    class NativeFormData {
      append() {}
    }
    vi.stubGlobal('FormData', NativeFormData);
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json(
          { error: 'CAPABILITY_UNAVAILABLE', message: '截图解析能力暂不可用' },
          { status: 503 },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: '00000000-0000-4000-8000-000000000002',
          accountId,
          source: 'unknown',
          sourceConfidence: 0,
          status: 'pending',
          idempotencyKey: 'screenshot-test-identity',
          rows: [],
          createdAt: '2026-10-22T01:00:00.000Z',
        }),
      );
    setApi(fetcher);
    const uploaded = vi.fn();
    await mount(<ScreenshotUpload accountId={accountId} disabled={false} onUploaded={uploaded} />);
    view.image.mockResolvedValueOnce(null).mockResolvedValueOnce(file);
    await click(button('从照片选择'));
    expect(button('上传为草稿').disabled).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    await click(button('从照片选择'));
    await click(button('上传为草稿'));
    expect(document.body.textContent).toContain('截图解析能力暂不可用');
    expect(document.body.textContent).toContain(file.name);
    expect(uploaded).not.toHaveBeenCalled();
    await click(button('上传为草稿'));
    expect(uploaded).toHaveBeenCalledOnce();
    expect(button('上传为草稿').disabled).toBe(true);
    expect(fetcher.mock.calls.every(([url]) => String(url).endsWith('/imports/screenshot'))).toBe(
      true,
    );
  });
});
