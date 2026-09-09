import type { BacktestResultV2, RunConfig, StrategySchemaV2 } from '@thesis-ledger/schemas';

export type StrategyStatus = 'draft' | 'active' | 'archived';
export type BacktestJobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export type StrategySchema = Record<string, unknown>;
export type V2StrategySchema = StrategySchemaV2;

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
  rejectedOrders?: Array<Record<string, unknown>>;
  warnings?: unknown;
  completeness?: Record<string, unknown>;
  benchmark?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
  engineVersion?: string;
  dataAsOf?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface BacktestJobSummary {
  id: string;
  strategyVersionId: string;
  mode?: 'V1' | 'V2';
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
  cancelRequestedAt?: string | null;
  executionAttempt?: number;
  attempt?: number;
  stage?: string | null;
  diagnostics?: unknown;
  dispatchedAt?: string | null;
  errorCode?: string | null;
  errorSummary?: string | null;
  engineVersion?: string | null;
  resultChecksum?: string | null;
  snapshotId?: string | null;
  initialCash?: number | null;
  warnings?: unknown;
}

export interface BacktestJob extends BacktestJobSummary {
  inSampleEnd?: string;
  input?: Record<string, unknown> | null;
  result?: BacktestJobResult | BacktestResultV2 | null;
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
  dataAsOf?: string;
  baseCurrency?: 'CNY' | 'HKD' | 'USD';
}

export interface FetchStrategyBarsInput {
  symbol: string;
  period: { start: string; end: string };
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
  benchmarkBars?: unknown[];
  initialCash: number;
  allowStale?: boolean;
}

export interface QueueBacktestV2Input {
  strategyVersionId: string;
  runConfig: RunConfig;
  idempotencyKey: string;
}
