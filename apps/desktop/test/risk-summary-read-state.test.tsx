// @vitest-environment jsdom
import { act, type ComponentProps } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialogProvider } from '../src/components/ui/confirm-dialog.js';
import { RiskOverview } from '../src/features/risk/RiskOverview.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const select = vi.fn();
const props: ComponentProps<typeof RiskOverview> = {
  mode: 'actual',
  portfolioValueAt: null,
  portfolioState: 'ready',
  loadState: 'ready',
  rulesState: 'ready',
  notificationsState: 'ready',
  rules: [],
  events: [],
  deliveries: [],
  lastUpdatedAt: null,
  scanning: false,
  onScan: vi.fn(),
  onSelectTab: select,
};
async function render(changes: Partial<typeof props>) {
  if (!host) {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  }
  await act(async () =>
    root.render(
      <ConfirmDialogProvider>
        <RiskOverview {...props} {...changes} />
      </ConfirmDialogProvider>,
    ),
  );
}
const metric = (label: string) =>
  [...host.querySelectorAll('button')].find((button) => button.textContent?.includes(label))!;
afterEach(async () => {
  await act(async () => root?.unmount());
  host?.remove();
  host = undefined!;
  vi.clearAllMocks();
});

describe('风险指标独立读取状态', () => {
  it.each([
    ['rulesState', '启用规则'],
    ['loadState', '严重事件'],
    ['notificationsState', '通知失败'],
  ] as const)('%s 首次失败显示未知且不能当作零项筛选', async (field, label) => {
    await render({ [field]: 'error' });
    expect(metric(label).textContent).toContain('—');
    expect(metric(label).textContent).toContain('读取失败');
    expect(metric(label).disabled).toBe(true);
    await act(async () => metric(label).click());
    expect(select).not.toHaveBeenCalled();
  });

  it('全失败或加载中不显示三个虚假零值', async () => {
    for (const state of ['error', 'loading'] as const) {
      await render({ rulesState: state, loadState: state, notificationsState: state });
      for (const label of ['启用规则', '严重事件', '通知失败'])
        expect(metric(label).querySelector('strong')?.textContent).toBe('—');
    }
  });

  it('成功零项继续显示零并允许查看，失败恢复后可正常导航', async () => {
    await render({ rulesState: 'error' });
    await render({ rulesState: 'empty' });
    expect(metric('启用规则').querySelector('strong')?.textContent).toBe('0');
    expect(metric('启用规则').disabled).toBe(false);
    await act(async () => metric('启用规则').click());
    expect(select).toHaveBeenCalledWith('rules');
  });

  it('刷新失败保留上次有效计数并标记旧数据，其他指标不受影响', async () => {
    await render({
      rulesState: 'stale',
      rules: [
        {
          id: 'rule-1',
          version: 1,
          kind: 'position-weight',
          scope: 'portfolio',
          severity: 'warning',
          threshold: 0.3,
          enabled: true,
          needsRepair: false,
          repairReason: null,
          archivedAt: null,
          symbol: null,
          accountId: null,
          effectiveAt: '2026-10-20T00:00:00.000Z',
        },
      ],
    });
    expect(metric('启用规则').textContent).toContain('旧数据，刷新失败');
    expect(metric('启用规则').querySelector('strong')?.textContent).toBe('1');
    expect(metric('通知失败').textContent).not.toContain('刷新失败');
  });
});
