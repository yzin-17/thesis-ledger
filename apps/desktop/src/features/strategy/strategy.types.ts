export type StrategyStatus = 'draft' | 'active' | 'archived';
export type BacktestJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type StrategySchema = Record<string, unknown>;

export interface StrategyVersion {
  id: string;
  version: number;
  schema?: StrategySchema;
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface StrategyRecord {
  id: string;
  name: string;
  description?: string | null;
  status?: StrategyStatus | (string & {});
  schemaVersion?: number;
  createdAt?: string;
  updatedAt?: string;
  versions: StrategyVersion[];
}

export interface BacktestJobResult {
  metrics?: Record<string, unknown>;
  equityCurve?: Array<{ date: string; value: number }>;
  trades?: Array<Record<string, unknown>>;
  engineVersion?: string;
  dataAsOf?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BacktestJob {
  id: string;
  strategyVersionId: string;
  status: BacktestJobStatus | (string & {});
  progress?: number | null;
  period?: { start: string; end: string };
  periodStart?: string;
  periodEnd?: string;
  inSampleEnd?: string;
  dataAsOf?: string;
  createdAt?: string;
  updatedAt?: string;
  startedAt?: string;
  finishedAt?: string;
  engineVersion?: string | null;
  resultChecksum?: string | null;
  input?: Record<string, unknown> | null;
  result?: BacktestJobResult | null;
  warnings?: unknown;
}

export interface CreateStrategyInput {
  name: string;
  schema: StrategySchema;
  description?: string;
}

export interface CreateStrategyVersionInput {
  strategyId: string;
  schema: StrategySchema;
}

export interface BacktestSetupInput {
  period: { start: string; end: string };
  initialCash: number;
  inSampleEnd?: string;
}

export interface QueueBacktestInput {
  id: string;
  strategyVersionId: string;
  status: 'queued';
  period: { start: string; end: string };
  inSampleEnd?: string;
  dataAsOf: string;
  warnings: string[];
  strategy: StrategySchema;
  bars: unknown[];
  initialCash: number;
  allowStale?: boolean;
}
