export interface AiRunPage<T = unknown> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ResearchFinishRoute {
  provider?: string;
  model?: string;
  fallbackErrors?: readonly string[];
  toolCallIds?: readonly string[];
}
