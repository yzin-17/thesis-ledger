import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { buildBacktestDiagnosticExport, type BacktestDiagnosticExport } from '../apps/desktop/src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob } from '../apps/desktop/src/features/strategy/strategy.types.js';

// 只读浏览器实际下载与标准持久结果；不生成替代导出。
const [jobId, path] = process.argv.slice(2);
assert(jobId && path, '需提供任务 ID 和浏览器实际诊断下载路径');
const bytes = await readFile(path);
const downloaded = JSON.parse(bytes.toString()) as BacktestDiagnosticExport;
const response = await fetch(`http://127.0.0.1:3000/api/v1/backtests/runs/${jobId}`);
assert(response.ok);
const job = (await response.json()) as BacktestJob;
assert(job.result);
assert.equal(job.result.schemaVersion, '3');
const expected = buildBacktestDiagnosticExport(job, job.result, new Date(downloaded.exportedAt));
assert.deepEqual(downloaded, expected, '实际诊断下载与持久结果及当前客户端映射不一致');
assert.equal(downloaded.identity.jobId, jobId);
assert.equal(downloaded.traceability.resultChecksum, job.resultChecksum);
assert.equal(downloaded.traceability.snapshotId, job.snapshotId);
assert.equal(downloaded.formatVersion, 2);
const cash = downloaded.outcome.cashDividends;
assert(cash && cash.records.length === 1);
assert.equal(cash.records[0]!.amountPerFundUnit, '0.064');
assert.equal(cash.records[0]!.eligibleQuantity, '12400');
assert.equal(cash.records[0]!.grossCashAmount, '793.6');
assert.equal(cash.historicalAvailability, 'notVerified');
assert.equal(cash.records[0]!.sourceDocuments.length, 2);
assert.equal(cash.records[0]!.observedAt, '2026-10-06T18:31:16.730840+00:00');
assert.equal(downloaded.reproduction.artifactMode, 'references-only');
assert.equal(downloaded.outcome.completeness, 'partial');
console.log(JSON.stringify({ jobId, path, sha256: createHash('sha256').update(bytes).digest('hex'),
  fullExportMatchesPersistentClientMapping: true, resultChecksum: job.resultChecksum, snapshotId: job.snapshotId,
  cashDividends: cash, benchmark: downloaded.outcome.benchmark }, null, 2));
