import type {
  BacktestExecutionModel,
  ExecutionModelDisclosure,
  BacktestResultV3,
  BacktestRunPreparationResultV3,
  BacktestRunCreateV3,
  ResultReadEligibility,
} from '@thesis-ledger/schemas';

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
  readEligibility?: ResultReadEligibility;
  executionModelDisclosure?: ExecutionModelDisclosure;
  id: string;
  strategyVersionId: string;
  mode?: 'V3';
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
  resultMetrics?: Record<string, unknown> | null;
  warnings?: unknown;
}

export interface BacktestJob extends BacktestJobSummary {
  inSampleEnd?: string;
  input?: Record<string, unknown> | null;
  result?: BacktestJobResult | BacktestResultV3 | null;
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
  adjustment?: 'none' | 'qfq' | 'hfq';
  prepared?: Extract<BacktestRunPreparationResultV3, { status: 'prepared' }>;
  executionModel?: BacktestExecutionModel;
  period: { start: string; end: string };
  initialCash: number;
  inSampleEnd?: string;
  dataAsOf?: string;
  baseCurrency?: 'CNY' | 'HKD' | 'USD';
}

export type QueueBacktestV3Input = BacktestRunCreateV3;
