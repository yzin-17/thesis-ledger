// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { button, click, field, flush, input, mount, view } from './mobile-view-harness';
import { SettingsScreen } from '../../src/features/settings/SettingsScreen';

describe('服务连接检查竞态', () => {
  it('用户放弃地址后，晚到的健康检查不能切换连接', async () => {
    vi.stubGlobal('__DEV__', true);
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const changeConnection = vi.fn().mockResolvedValue(true);
    Object.assign(view.runtime, { baseUrl: 'https://one.test/api/v1', changeConnection });
    await mount(<SettingsScreen />);
    await input(field('API 地址'), 'https://two.test/api/v1');
    await click(button('验证并连接'));
    expect(button('正在连接…').disabled).toBe(true);
    await act(async () => {
      view.dirty.mock.calls.at(-1)?.[1]();
      finish(Response.json({ service: 'thesis-ledger', status: 'healthy' }));
    });
    await flush();
    expect(changeConnection).not.toHaveBeenCalled();
    expect(field('API 地址').value).toBe('https://one.test/api/v1');
  });
});
