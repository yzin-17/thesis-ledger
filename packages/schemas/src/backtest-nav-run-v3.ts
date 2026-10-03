import { z } from 'zod';
import {
  backtestNavRunConfigV3Schema,
  backtestNavSnapshotManifestV3Schema,
} from './backtest-nav-freeze-v3.js';
import { backtestNavResultV3Schema } from './backtest-nav-result-v3.js';

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });

/** NAV Run 只接受服务端已落库、带当前冻结摘要的准备凭证。 */
export const backtestNavRunCreateV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  preparationId: z.uuid(),
  preparationHash: hash,
  idempotencyKey: z.string().trim().min(1).max(128),
});

/** NAV Run 的独立 HTTP 读取合同，不复用场内执行结果结构。 */
export const backtestNavRunResponseV3Schema = z
  .strictObject({
    contractVersion: z.literal(3),
    schemaVersion: z.literal('3'),
    inputKind: z.literal('nav'),
    id: z.uuid(),
    strategyVersionId: z.uuid(),
    preparationId: z.uuid(),
    preparationHash: hash,
    idempotencyKey: z.string().min(1).max(128),
    status: z.enum(['queued', 'running', 'succeeded', 'failed', 'cancelled']),
    stage: z.string().nullable(),
    progress: z.number().int().min(0).max(100),
    periodStart: instant,
    periodEnd: instant,
    dataAsOf: instant,
    runConfig: backtestNavRunConfigV3Schema,
    executionAttempt: z.number().int().nonnegative(),
    snapshotId: hash.nullable(),
    snapshotManifest: backtestNavSnapshotManifestV3Schema.nullable(),
    errorCode: z.string().nullable(),
    errorSummary: z.string().nullable(),
    createdAt: instant,
    updatedAt: instant,
    startedAt: instant.nullable(),
    finishedAt: instant.nullable(),
    engineVersion: z.string().nullable().default(null),
    resultChecksum: z
      .string()
      .regex(/^[a-f0-9]{16}$/)
      .nullable()
      .default(null),
    result: backtestNavResultV3Schema.nullable().default(null),
  })
  .superRefine((run, ctx) => {
    if (run.status === 'succeeded' && (!run.result || !run.resultChecksum || !run.engineVersion))
      ctx.addIssue({
        code: 'custom',
        path: ['result'],
        message: '成功 NAV Run 必须保留结果及执行身份',
      });
    if (
      run.result &&
      (run.status !== 'succeeded' ||
        run.result.runId !== run.id ||
        run.result.strategyVersionId !== run.strategyVersionId ||
        run.result.snapshotId !== run.snapshotId ||
        run.result.resultChecksum !== run.resultChecksum ||
        run.result.engineVersion !== run.engineVersion)
    )
      ctx.addIssue({ code: 'custom', path: ['result'], message: 'NAV Run 与公开结果身份不一致' });
  });

export type BacktestNavRunCreateV3 = z.infer<typeof backtestNavRunCreateV3Schema>;
export type BacktestNavRunResponseV3 = z.infer<typeof backtestNavRunResponseV3Schema>;

/** 列表只投影任务身份和状态；经济结果与物理冻结校验仍由详情入口负责。 */
export const backtestNavRunSummaryV3Schema = z.strictObject({
  contractVersion: z.literal(3),
  inputKind: z.literal('nav'),
  id: z.uuid(),
  strategyVersionId: z.uuid(),
  symbol: z.string().regex(/^\d{6}\.OF$/),
  status: backtestNavRunResponseV3Schema.shape.status,
  stage: z.string().nullable(),
  progress: z.number().int().min(0).max(100),
  periodStart: instant,
  periodEnd: instant,
  errorCode: z.string().nullable(),
  errorSummary: z.string().nullable(),
  createdAt: instant,
  updatedAt: instant,
});
export const backtestNavRunListV3Schema = z.array(backtestNavRunSummaryV3Schema).max(100);
export type BacktestNavRunSummaryV3 = z.infer<typeof backtestNavRunSummaryV3Schema>;
