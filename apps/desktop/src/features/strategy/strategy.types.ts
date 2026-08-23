export interface StrategyRecord {
  id: string;
  name: string;
  versions: Array<{ id: string; version: number }>;
}

export interface BacktestJob {
  id: string;
  strategyVersionId: string;
  status: string;
  progress: number;
  result: unknown;
  warnings: unknown;
}

export type StrategySchema = Record<string, unknown>;

export interface CreateStrategyInput {
  name: string;
  schema: StrategySchema;
}

export interface QueueBacktestInput {
  id: string;
  strategyVersionId: string;
  status: 'queued';
  period: { start: string; end: string };
  dataAsOf: string;
  warnings: unknown[];
  strategy: StrategySchema;
  bars: unknown[];
  initialCash: number;
}
