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
});
