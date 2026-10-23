// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { mount, setApi } from './mobile-view-harness';
import { RiskNotifications } from '../../src/features/risk-events/RiskNotifications';
import { RiskEventsScreen } from '../../src/features/risk-events/RiskEventsScreen';
describe('M16 风险事件与通知读取', () => {
  it('路由失败显示未知，不显示未配置；通知失败不显示空集', async () => {
    const fetcher = vi.fn().mockImplementation((url: RequestInfo | URL) =>
      Promise.resolve(
        Response.json(
          {
            error: 'Unavailable',
            message: String(url).includes('/routing') ? '路由读取失败' : '通知读取失败',
          },
          { status: 503 },
        ),
      ),
    );
    setApi(fetcher);
    await mount(<RiskNotifications />);
    expect(document.body.textContent).toContain('路由状态未知');
    expect(document.body.textContent).toContain('通知读取失败');
    expect(document.body.textContent).not.toContain('尚未配置通知路由');
    expect(fetcher.mock.calls.every(([, init]) => !init?.method)).toBe(true);
  });
  it('风险事件失败保留错误原因，不当成没有事件', async () => {
    setApi(
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: 'Unavailable', message: '事件读取失败' }, { status: 503 }),
        ),
    );
    await mount(<RiskEventsScreen />);
    expect(document.body.textContent).toContain('事件读取失败');
  });
});
