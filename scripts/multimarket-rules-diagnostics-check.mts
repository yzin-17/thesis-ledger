import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  buildBacktestDiagnosticExport,
  type BacktestDiagnosticExport,
} from '../apps/desktop/src/features/strategy/strategy-backtest-diagnostics.model.js';
import type { BacktestJob } from '../apps/desktop/src/features/strategy/strategy.types.js';
import {
  backtestRunResponseSchemaV3,
  wholeShareWindowBenchmarkCostVersionV3,
  researchLotShareWindowBenchmarkCostVersionV3,
} from '@thesis-ledger/schemas';

// 只读实际浏览器保存文件；不生成替代诊断。
const [jobId, path] = process.argv.slice(2);
assert(jobId && path);
const bytes = await readFile(path);
const downloaded = JSON.parse(bytes.toString()) as BacktestDiagnosticExport;
const response = await fetch(`http://127.0.0.1:3000/api/v1/backtests/runs/${jobId}`);
assert(response.ok);
const job = (await response.json()) as BacktestJob;
const { snapshotManifest, result } = backtestRunResponseSchemaV3.parse(job);
assert(job.result?.schemaVersion === '3');
assert.deepEqual(
  downloaded,
  buildBacktestDiagnosticExport(job, job.result, new Date(downloaded.exportedAt)),
);
assert.equal(downloaded.identity.jobId, jobId);
assert.equal(downloaded.traceability.resultChecksum, job.resultChecksum);
assert.equal(downloaded.traceability.snapshotId, job.snapshotId);
const status = downloaded.outcome.tradingStatus,
  fees = downloaded.outcome.publicFees;
assert(status?.status === 'source');
assert(status.sourceDocuments.every((doc) => doc.sha256 && doc.observedAt));
if (snapshotManifest?.benchmarkCostVersion === wholeShareWindowBenchmarkCostVersionV3) {
  assert.equal(snapshotManifest.executionPriceProtocol.priceBasis.quantityBasis, 'actual-units');
  assert.equal(snapshotManifest.executionPriceProtocol.priceBasis.adjustment, 'none');
  assert(fees?.status === 'source');
  assert(status.days.every(day => day.state === 'unknown' && !day.intradayHalts?.length));
  assert.equal(fees.provenance.chargeDatePolicy?.effectiveTradeDate, '2024-05-20');
  assert(result?.benchmarkCompatibility?.costAssumption.kind === 'execution-model');
  assert.equal(result.benchmarkCompatibility.costAssumption.version, wholeShareWindowBenchmarkCostVersionV3);
} else if (snapshotManifest?.benchmarkCostVersion === researchLotShareWindowBenchmarkCostVersionV3) {
  const lot = downloaded.frozenConfiguration.researchLotSize;
  assert(lot && lot.historicalChanges === 'unverified');
  assert(/^[1-9]\d*$/.test(lot.sharesPerLot));
  assert.equal(lot.defaultSharesPerLot, '5000');
  assert.equal(snapshotManifest.executionPriceProtocol.priceBasis.quantityBasis, 'actual-units');
  assert.equal(snapshotManifest.executionPriceProtocol.priceBasis.adjustment, 'none');
  assert(fees?.status === 'source');
  assert(status.days.every(day => day.state === 'unknown' && !day.intradayHalts?.length));
  assert(result?.benchmarkCompatibility?.costAssumption.kind === 'execution-model');
  assert.equal(result.benchmarkCompatibility.costAssumption.version, researchLotShareWindowBenchmarkCostVersionV3);
} else if (status.days.some((day) => day.listingPhase)) {
  assert(status.days.some((day) => day.noDailyPriceLimit || day.listingPhase === 'delisted'));
  assert(snapshotManifest?.tradingStatus?.freezeVersion === 'frozen-trading-status-v3');
} else {
  assert(fees?.status === 'source');
  assert.equal(status.executionInterpretation?.policy, 'exclude-known-halt-date-v1');
  assert.equal(
    status.days.reduce((count, day) => count + (day.intradayHalts?.length ?? 0), 0),
    fees.provenance.exchange === 'XHKG' ? 1 : 3,
  );
  assert(fees.sourceDocuments.every((doc) => doc.sha256 && doc.observedAt));
  assert(fees.provenance.coverageDescription?.includes('未纳入'));
  if (fees.provenance.exchange === 'XNYS') {
    assert.equal(fees.provenance.chargeDatePolicy?.effectiveTradeDate, '2024-05-20');
    assert.equal(fees.provenance.chargeDatePolicy?.rateChangeChargeDate, '2024-05-22');
  }
}
console.log(
  JSON.stringify(
    {
      jobId,
      path,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      fullExportMatchesPersistentClientMapping: true,
      checksum: job.resultChecksum,
      snapshotId: job.snapshotId,
      exactSourceClocksAndChargeDatePolicyPreserved: true,
    },
    null,
    2,
  ),
);
