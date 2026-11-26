import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { hashCanonicalManifest } from '../backtest/backtest-snapshot.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';

const inputSchema = z.strictObject({
  sourceHead: z.string().min(1),
  versions: z.array(z.strictObject({
    id: z.uuid(),
    strategyId: z.uuid(),
    version: z.number().int(),
    schemaVersion: z.number().int(),
    definition: z.unknown(),
    backtests: z.number().int().nonnegative(),
    journalEntries: z.number().int().nonnegative(),
  })),
});

// 读取同一个 SELECT 导出的版本与引用。只输出标识、计数和摘要。
const source = inputSchema.parse(JSON.parse(readFileSync(0, 'utf8')));
const versions = source.versions.map((row) => {
  const decision = convertStrategyDefinition(row.schemaVersion, row.definition);
  return {
    id: row.id,
    strategyId: row.strategyId,
    version: row.version,
    schemaVersion: row.schemaVersion,
    sourceHash: hashCanonicalManifest(row.definition),
    backtests: row.backtests,
    journalEntries: row.journalEntries,
    outcome: decision.outcome,
    ...('reason' in decision ? { reason: decision.reason } : {
      definitionHash: hashCanonicalManifest(decision.definition),
    }),
  };
});
const counts = { current: 0, convert: 0, delete: 0, blocked: 0 };
for (const row of versions) counts[row.outcome] += 1;
process.stdout.write(JSON.stringify({
  contract: 'strategy-definition-migration-preview-v1',
  sourceHead: source.sourceHead,
  counts,
  versions,
}) + '\n');
