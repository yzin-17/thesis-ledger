import { createInterface } from 'node:readline';
import { readdir } from 'node:fs/promises';
import {
  rehearseBacktestArtifactConversion, type PriceAcquisition,
} from './named-v1-backtest-artifact-rehearsal.js';
import {
  previewTradeBacktest,
  type BacktestMigrationRow,
} from './named-v1-backtest-conversion.js';

// 输入是只读查询导出的行，一行一个关联好的回测及原策略版本。
const [sourceRoot, stagingRoot] = process.argv.slice(2);
if (!!sourceRoot !== !!stagingRoot || (stagingRoot && (await readdir(stagingRoot)).length !== 0))
  throw new Error('制品演练需要来源副本和一个全新的空白目录');
const counts = { database: 0, artifacts: 0, rehearsed: 0, unproven: 0 };
const jobs = [];
type Issue = { code: string; path?: PropertyKey[]; errors?: Issue[][] };
function issuePaths(issues: readonly Issue[]): string[] {
  return issues.flatMap((issue) => {
    const path = issue.path?.join('.') || issue.code;
    return issue.errors ? [path, ...issuePaths(issue.errors.flat()).map((child) => path + '.' + child)] : [path];
  });
}
function failure(error: unknown) {
  let issues = error && typeof error === 'object' && 'issues' in error && Array.isArray(error.issues)
    ? error.issues as Issue[] : null;
  if (!issues && error instanceof Error && error.message.startsWith('[')) {
    try {
      const parsed = JSON.parse(error.message) as unknown;
      if (Array.isArray(parsed) && parsed.every((entry: unknown) =>
        entry !== null && typeof entry === 'object' && 'code' in entry && typeof entry.code === 'string'))
        issues = parsed as Issue[];
    } catch {
      // 文件或校验异常只显示简短原因。
    }
  }
  return issues ? '隔离制品字段未通过校验：' + [...new Set(issuePaths(issues))].slice(0, 7).join('、')
    : error instanceof Error ? error.message.slice(0, 200) : '隔离制品核验失败';
}
for await (const input of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const row = JSON.parse(input) as {
    job: BacktestMigrationRow;
    strategy: { schemaVersion: number; definition: unknown };
    referenceWindow?: PriceAcquisition;
  };
  const plan = previewTradeBacktest(row.job, row.strategy);
  const result = plan.outcome === 'artifacts' && sourceRoot && stagingRoot
    ? await rehearseBacktestArtifactConversion({
        original: row.job, converted: plan.row, strategy: row.strategy, sourceRoot, stagingRoot,
        referenceWindow: row.referenceWindow,
      }).catch((error: unknown) => ({
        outcome: 'unproven' as const,
        reason: failure(error),
      }))
    : plan;
  counts[result.outcome] += 1;
  jobs.push({
    id: row.job.id,
    strategyVersionId: row.job.strategyVersionId,
    status: row.job.status,
    outcome: result.outcome,
    ...('reason' in result ? { reason: result.reason } : {}),
  });
}
process.stdout.write(JSON.stringify({
  contract: 'backtest-trade-migration-preview-v1', counts, jobs,
}) + '\n');
