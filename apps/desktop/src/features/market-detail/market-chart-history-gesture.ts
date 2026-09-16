export type HistoryDragState = {
  isPointerDown: boolean;
  isDragging: boolean;
  handledBoundary: boolean;
};

export const idleHistoryDragState: HistoryDragState = {
  isPointerDown: false,
  isDragging: false,
  handledBoundary: false,
};

export const beginHistoryDrag = (): HistoryDragState => ({
  isPointerDown: true,
  isDragging: false,
  handledBoundary: false,
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
  }: {
    hasLeftHistoryBlank: boolean;
    canLoadEarlier: boolean;
    historyLoading: boolean;
  },
) => {
  if (!state.isDragging || !hasLeftHistoryBlank || state.handledBoundary) {
    return { state, shouldLoadEarlier: false };
  }
  return {
    state: { ...state, handledBoundary: true },
    shouldLoadEarlier: canLoadEarlier && !historyLoading,
  };
};
