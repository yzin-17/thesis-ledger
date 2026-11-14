// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { button, click, mount } from './mobile-view-harness';
import { ArenaLiveAccount } from '../../src/features/model-arena/ArenaLiveAccount';
import { arenaAccountFixture } from '../arena-account-fixture';

it('账户状态允许手动决策，切换明细只更新展示，不自动预约', async () => {
  const trigger = vi.fn();
  await mount(
    <ArenaLiveAccount
      detail={arenaAccountFixture()}
      agentId="agent"
      onRetry={vi.fn()}
      busy={false}
      onTrigger={trigger}
    />,
  );
  expect(button('手动触发决策')).toBeDefined();
  expect(trigger).not.toHaveBeenCalled();
  for (const [tab, empty] of [
    ['持仓', '当前空仓'],
    ['委托', '暂无委托'],
    ['成交', '暂无成交'],
  ]) {
    await click(button(tab!));
    expect(document.body.textContent).toContain(empty);
  }
  await click(button('研究与预约'));
  expect(document.body.textContent).toContain('尚无待触发预约');
  await click(button('手动触发决策'));
  expect(trigger).toHaveBeenCalledOnce();
});

it.each(['paused', 'exhausted'] as const)('暂停或额度耗尽时没有手动入口：%s', async (state) => {
  const detail = arenaAccountFixture();
  if (state === 'paused') detail.state = 'paused';
  else detail.agents[0]!.remaining.requests = 0;
  await mount(
    <ArenaLiveAccount
      detail={detail}
      agentId="agent"
      onRetry={vi.fn()}
      busy={false}
      onTrigger={vi.fn()}
    />,
  );
  expect(button('手动触发决策')).toBeUndefined();
});
