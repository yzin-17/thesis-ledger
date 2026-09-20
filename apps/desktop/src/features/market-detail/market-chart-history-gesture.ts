export type HistoryDragState = {
  isPointerDown: boolean;
  isDragging: boolean;
  handledBoundary: boolean;
  handledLatestBoundary: boolean;
};

export const idleHistoryDragState: HistoryDragState = {
  isPointerDown: false,
  isDragging: false,
  handledBoundary: false,
  handledLatestBoundary: false,
};

export const beginHistoryDrag = (): HistoryDragState => ({
  isPointerDown: true,
  isDragging: false,
  handledBoundary: false,
  handledLatestBoundary: false,
});

export const markHistoryDragMovement = (state: HistoryDragState): HistoryDragState => {
  if (!state.isPointerDown || state.isDragging) return state;
  return { ...state, isDragging: true };
};

export const endHistoryDrag = (): HistoryDragState => idleHistoryDragState;

export const transitionHistoryBoundary = (
  state: HistoryDragState,
  {
    hasLeftHistoryBlank,
    canLoadEarlier,
    historyLoading,
    hasReachedLatestBoundary = false,
    canLoadLater = false,
    latestLoading = false,
  }: {
    hasLeftHistoryBlank: boolean;
    canLoadEarlier: boolean;
    historyLoading: boolean;
    hasReachedLatestBoundary?: boolean;
    canLoadLater?: boolean;
    latestLoading?: boolean;
  },
) => {
  if (!state.isDragging) {
    return { state, shouldLoadEarlier: false, shouldLoadLater: false };
  }
  let next = state;
  let shouldLoadEarlier = false;
  let shouldLoadLater = false;
  if (hasLeftHistoryBlank && !state.handledBoundary) {
    next = { ...next, handledBoundary: true };
    shouldLoadEarlier = canLoadEarlier && !historyLoading;
  }
  // 与左边界各自独立记账：一次拖动里既可能先撞左边界再撞右边界，两者不得互相吞掉。
  if (hasReachedLatestBoundary && !next.handledLatestBoundary) {
    next = { ...next, handledLatestBoundary: true };
    shouldLoadLater = canLoadLater && !latestLoading;
  }
  return { state: next, shouldLoadEarlier, shouldLoadLater };
};
