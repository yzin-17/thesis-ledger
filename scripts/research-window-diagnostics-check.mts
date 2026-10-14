import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  buildBacktestDiagnosticExport,
  buildBacktestDiagnosticSummary,
  type BacktestDiagnosticExport,
} from '../apps/desktop/src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob } from '../apps/desktop/src/features/strategy/strategy.types.js';
import { backtestUnknownListingWarningV3 } from '../packages/schemas/dist/index.js';

// ESM 入口；只读用户实际导出的文件与标准 API，不生成替代导出或修改结果。
const samples = [
  { symbol: '600519.SH', id: 'dbc39963-da96-4583-8746-01feac9c7ff2', checksum: '022494dccd271850' },
  { symbol: '600000.SH', id: '73ab7c23-9335-4771-a612-5f1a1547734f', checksum: '1e83d3eb24788bcf' },
];
const output = [];
for (const [index, sample] of samples.entries()) {
  const path = process.argv[index + 2];
  assert(path, '需依次提供 600519.SH 与 600000.SH 的实际导出文件路径');
  const bytes = await readFile(path);
  const diagnostic = JSON.parse(bytes.toString()) as BacktestDiagnosticExport;
  const response = await fetch(`http://127.0.0.1:3000/api/v1/backtests/runs/${sample.id}`);
  assert(response.ok);
  const job = (await response.json()) as BacktestJob;
  assert(job.result);
  const expected = buildBacktestDiagnosticExport(job, job.result, new Date(diagnostic.exportedAt));
  assert.deepEqual(diagnostic, expected, '实际导出文件与当前持久结果及客户端映射不一致');
  assert.equal(diagnostic.identity.jobId, sample.id);
  assert.equal(diagnostic.identity.runId, sample.id);
  assert.equal(diagnostic.traceability.resultChecksum, sample.checksum);
  assert.equal(diagnostic.traceability.snapshotId, job.snapshotId);
  assert.equal(diagnostic.outcome.completeness, 'complete');
  assert.equal(
    diagnostic.outcome.benchmarkCompatibility.costAssumption.version,
    'execution-model-cost-v1',
  );
  assert.equal(
    diagnostic.outcome.warnings.includes(backtestUnknownListingWarningV3),
    sample.symbol === '600519.SH',
  );
  assert(diagnostic.outcome.warnings.some((warning) => warning.includes('使用已选执行模型')));
  assert.equal(diagnostic.reproduction.artifactMode, 'references-only');
  assert.equal(diagnostic.reproduction.dependencyAccess, 'unverified');
  const summary = buildBacktestDiagnosticSummary(diagnostic);
  assert(summary.includes(sample.id) && summary.includes(sample.checksum));
  assert(summary.includes(String(diagnostic.traceability.snapshotId)));
  assert.equal(summary.includes(backtestUnknownListingWarningV3), sample.symbol === '600519.SH');
  assert(
    summary.includes(String(diagnostic.outcome.benchmarkCompatibility.costAssumption.fingerprint)),
  );
  output.push({
    symbol: sample.symbol,
    path,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fullExportMatchesPersistentClientMapping: true,
    diagnostic,
    summary,
    summaryScope: '由实际下载文件通过当前客户端函数生成；不作为系统剪贴板读取证据',
  });
}
console.log(JSON.stringify({ samples: output }, null, 2));
