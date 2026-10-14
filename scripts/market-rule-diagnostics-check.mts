import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { backtestSnapshotManifestV3Schema } from '../packages/schemas/src/index.js';
import { buildBacktestDiagnosticExport, type BacktestDiagnosticExport } from '../apps/desktop/src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob } from '../apps/desktop/src/features/strategy/strategy.types.js';

// 只读真实下载字节与持久结果；此检查不生成替代文件。
const [jobId, path] = process.argv.slice(2);
assert(jobId && path);
const bytes = await readFile(path);
const downloaded = JSON.parse(bytes.toString()) as BacktestDiagnosticExport;
const response = await fetch(`http://127.0.0.1:3000/api/v1/backtests/runs/${jobId}`);
assert(response.ok);
const job = await response.json() as BacktestJob;
assert(job.result && job.result.schemaVersion === '3');
assert.deepEqual(downloaded, buildBacktestDiagnosticExport(job, job.result, new Date(downloaded.exportedAt)));
assert.equal(downloaded.identity.jobId, jobId);
assert.equal(downloaded.traceability.resultChecksum, job.resultChecksum);
assert.equal(downloaded.traceability.snapshotId, job.snapshotId);
assert.equal(downloaded.formatVersion, 2);
assert.equal(downloaded.frozenConfiguration.marketRuleResearch, 'raw-prices-no-corporate-actions-v1');
const snapshot = backtestSnapshotManifestV3Schema.parse(job.snapshotManifest);
assert.equal(snapshot.tradingStatus?.freezeVersion, 'frozen-trading-status-v2');
const status = downloaded.outcome.tradingStatus;
assert(status?.status === 'source');
assert.equal(status.days[0]!.dailyPriceLimit!.maxUpRatio, '0.05');
assert.equal(status.days[0]!.riskWarning!.delisting, 'active');
assert.equal(status.days[2]!.dailyPriceLimit!.maxUpRatio, '0.1');
assert.equal(status.days[2]!.riskWarning!.delisting, 'none');
assert.equal(status.sourceDocuments[0]!.observedAt, '2026-10-07T06:18:28.685988+00:00');
assert.equal(status.sourceDocuments[0]!.sha256, 'd98685515a9022db66f689cfbe782991575f3de03b0fc7d70c340170ba9b73a2');
console.log(JSON.stringify({ jobId, path, sha256: createHash('sha256').update(bytes).digest('hex'),
  fullExportMatchesPersistentClientMapping: true, checksum: job.resultChecksum,
  snapshotId: job.snapshotId, freezeVersion: snapshot.tradingStatus?.freezeVersion }, null, 2));
