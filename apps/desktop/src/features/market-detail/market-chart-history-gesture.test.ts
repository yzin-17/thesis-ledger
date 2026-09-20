import { describe, expect, it } from 'vitest';
import {
  beginHistoryDrag,
  endHistoryDrag,
  idleHistoryDragState,
  markHistoryDragMovement,
  transitionHistoryBoundary,
} from './market-chart-history-gesture.js';

const boundary = (state: ReturnType<typeof beginHistoryDrag>, historyLoading = false) =>
  transitionHistoryBoundary(state, {
    hasLeftHistoryBlank: true,
    canLoadEarlier: true,
    historyLoading,
  });

const latestBoundary = (
  state: ReturnType<typeof beginHistoryDrag>,
  { latestLoading = false, canLoadLater = true } = {},
) =>
  transitionHistoryBoundary(state, {
    hasLeftHistoryBlank: false,
    canLoadEarlier: false,
    historyLoading: false,
    hasReachedLatestBoundary: true,
    canLoadLater,
    latestLoading,
  });

describe('market chart history drag gesture', () => {
  it('不因初始或程序化逻辑范围变化触发历史加载', () => {
    expect(boundary(idleHistoryDragState).shouldLoadEarlier).toBe(false);
    expect(boundary(beginHistoryDrag()).shouldLoadEarlier).toBe(false);
  });

  it('每次实际拖动进入左侧空白最多加载一次', () => {
    const dragging = markHistoryDragMovement(beginHistoryDrag());
    const first = boundary(dragging);
    const repeated = boundary(first.state);

    expect(first.shouldLoadEarlier).toBe(true);
    expect(repeated.shouldLoadEarlier).toBe(false);
  });

  it('加载中不重入，手势结束后可在下一次拖动重试', () => {
    const duringLoading = boundary(markHistoryDragMovement(beginHistoryDrag()), true);
    const retry = boundary(markHistoryDragMovement(beginHistoryDrag()), false);

    expect(duringLoading.shouldLoadEarlier).toBe(false);
    expect(duringLoading.state.handledBoundary).toBe(true);
    expect(endHistoryDrag()).toEqual(idleHistoryDragState);
    expect(retry.shouldLoadEarlier).toBe(true);
  });

  it('不因初始或程序化逻辑范围变化触发更新日线探测', () => {
    expect(latestBoundary(idleHistoryDragState).shouldLoadLater).toBe(false);
    expect(latestBoundary(beginHistoryDrag()).shouldLoadLater).toBe(false);
  });

  it('拖动贴到最新边界最多探测一次，加载中不重入', () => {
    const first = latestBoundary(markHistoryDragMovement(beginHistoryDrag()));
    const repeated = latestBoundary(first.state);
    const duringLoading = latestBoundary(markHistoryDragMovement(beginHistoryDrag()), {
      latestLoading: true,
    });

    expect(first.shouldLoadLater).toBe(true);
    expect(repeated.shouldLoadLater).toBe(false);
    expect(duringLoading.shouldLoadLater).toBe(false);
    expect(duringLoading.state.handledLatestBoundary).toBe(true);
    expect(latestBoundary(markHistoryDragMovement(beginHistoryDrag()), { canLoadLater: false })
      .shouldLoadLater).toBe(false);
  });

  it('一次拖动里两侧边界各自记账，互不吞掉', () => {
    const dragging = markHistoryDragMovement(beginHistoryDrag());
    const both = transitionHistoryBoundary(dragging, {
      hasLeftHistoryBlank: true,
      canLoadEarlier: true,
      historyLoading: false,
      hasReachedLatestBoundary: true,
      canLoadLater: true,
      latestLoading: false,
    });
    const afterLatest = latestBoundary(both.state);

    expect(both.shouldLoadEarlier).toBe(true);
    expect(both.shouldLoadLater).toBe(true);
    expect(afterLatest.shouldLoadEarlier).toBe(false);
    expect(afterLatest.shouldLoadLater).toBe(false);
  });
});
