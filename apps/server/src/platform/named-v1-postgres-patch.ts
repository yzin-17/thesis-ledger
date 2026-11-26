import { isDeepStrictEqual } from 'node:util';

type Json = Record<string, unknown>;
const columns = {
  Strategy: ['schemaVersion'],
  StrategyVersion: ['schemaVersion', 'schema'],
  BacktestJob: ['mode', 'input', 'runConfig', 'snapshotId', 'snapshotManifest', 'result', 'resultChecksum'],
  MarketBarWindowEvidenceV3: ['completeResponse', 'completeResponseHash'],
  MarketDerivedSeriesSnapshotV3: ['snapshot'],
  MarketReportMetadataSnapshot: ['payload', 'contentHash'],
  StrategySubmission: ['input', 'prepared'],
  StrategyAuthoringRevision: ['content', 'validation'],
  StrategyAuthoringOperation: ['input'],
  AiRun: ['researchScopeSnapshot', 'modelMetadata', 'result'],
  ProviderConfig: ['settings'],
  DesiredProviderPolicy: ['routes', 'effectiveProjection'],
  DesiredProviderPolicyRevision: ['routes', 'effectiveProjection'],
  OptimizationExperiment: ['runConfig', 'dataFingerprint', 'frozenDataFingerprints'],
  OptimizationCandidate: ['executionHash'],
  OptimizationAdoption: ['candidateHash'],
  ArenaLiveMatch: ['protocol'],
  ArenaLiveCycle: ['input'],
  ModelArena: ['protocol'],
} as const;
type Table = keyof typeof columns;

export type NamedV1PostgresPatch = {
  table: Table;
  key: Json;
  expected: Json;
  replacement: Json;
};

const primaryKey = {
  Strategy: ['id'],
  StrategyVersion: ['id'],
  BacktestJob: ['id'],
  MarketBarWindowEvidenceV3: ['identityFingerprint'],
  MarketDerivedSeriesSnapshotV3: ['inputFingerprint'],
  MarketReportMetadataSnapshot: ['id'],
  StrategySubmission: ['id'],
  StrategyAuthoringRevision: ['draftId', 'revision'],
  StrategyAuthoringOperation: ['id'],
  AiRun: ['id'],
  ProviderConfig: ['id'],
  DesiredProviderPolicy: ['consumer'],
  DesiredProviderPolicyRevision: ['id'],
  OptimizationExperiment: ['id'],
  OptimizationCandidate: ['id'],
  OptimizationAdoption: ['id'],
  ArenaLiveMatch: ['id'],
  ArenaLiveCycle: ['id'],
  ModelArena: ['id'],
} as const satisfies Record<Table, readonly string[]>;

export function namedV1PostgresPatch(table: Table, before: Json, after: Json): NamedV1PostgresPatch | null {
  const key = Object.fromEntries(primaryKey[table].map((name) => [name, before[name]]));
  if (!Object.values(key).every((value) => typeof value === 'string' && value.length > 0 ||
    typeof value === 'number' && Number.isSafeInteger(value)))
    throw new Error(`${table} 缺少明确记录身份`);
  const expected: Json = {}, replacement: Json = {};
  for (const name of columns[table]) {
    if (!(name in before) || !(name in after) || before[name] === undefined || after[name] === undefined)
      throw new Error(`${table} 缺少待核验字段 ${name}`);
    if (isDeepStrictEqual(before[name], after[name])) continue;
    expected[name] = before[name];
    replacement[name] = after[name];
  }
  return Object.keys(replacement).length ? { table, key, expected, replacement } : null;
}

const quote = (name: string) => '"' + name + '"';
const jsonLiteral = (value: unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";

/** 将已经验证的转换放入调用方事务。行发生变化时整笔回滚。 */
export function buildNamedV1PostgresPatchSql(patches: readonly NamedV1PostgresPatch[]) {
  const statements = ['SET LOCAL standard_conforming_strings = on;'];
  const seen = new Set<string>();
  for (const patch of patches) {
    if (!Object.hasOwn(columns, patch.table)) throw new Error('未知转换表');
    const keys = primaryKey[patch.table];
    const fields = columns[patch.table].filter((name) => Object.hasOwn(patch.replacement, name));
    if (Object.keys(patch.key).length !== keys.length || !keys.every((name) => Object.hasOwn(patch.key, name)) ||
      !fields.length || fields.length !== Object.keys(patch.replacement).length ||
      fields.length !== Object.keys(patch.expected).length ||
      !fields.every((name) => Object.hasOwn(patch.expected, name)))
      throw new Error('转换记录的身份和字段集合不匹配');
    const identity = JSON.stringify([patch.table, keys.map((key) => patch.key[key])]);
    if (seen.has(identity)) throw new Error('转换记录重复');
    seen.add(identity);
    const table = quote(patch.table);
    const keysMatch = keys.map((name) => `t.${quote(name)} = original.${quote(name)}`).join(' AND ');
    const valuesMatch = fields.map((name) =>
      `to_jsonb(t)->'${name}' IS NOT DISTINCT FROM source.value->'${name}'`,
    ).join(' AND ');
    statements.push(`WITH source(value) AS (VALUES (${jsonLiteral({ ...patch.key, ...patch.expected })})),
applied AS (
  UPDATE ${table} t
  SET ${fields.map((name) => `${quote(name)} = replacement.${quote(name)}`).join(', ')}
  FROM source,
       jsonb_populate_record(NULL::${table}, source.value) original,
       jsonb_populate_record(NULL::${table}, ${jsonLiteral(patch.replacement)}) replacement
  WHERE ${keysMatch} AND ${valuesMatch}
  RETURNING 1
)
SELECT 1 / count(*) AS "verified_${patch.table}" FROM applied;`);
  }
  return statements.join('\n') + '\n';
}

export function buildNamedV1ResearchRetirementSql(run: Json, toolIds: readonly string[]) {
  const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u;
  if (typeof run.id !== 'string' || !uuid.test(run.id) || toolIds.some((id) => !uuid.test(id)) ||
      !toolIds.length || new Set(toolIds).size !== toolIds.length)
    throw new Error('研究清理身份或工具清单无效');
  const id = "'" + run.id + "'::uuid";
  const tools = toolIds.map((value) => "'" + value + "'::uuid").join(', ');
  const original = jsonLiteral({ modelMetadata: run.modelMetadata, result: run.result });
  return `LOCK TABLE "AiRun", "AiToolCall", "AiInvocation", "ResearchObservation",
    "OptimizationAttempt", "AuditLog" IN SHARE ROW EXCLUSIVE MODE;
SELECT 1 / count(*) FROM "AiRun" r
WHERE r.id = ${id} AND r.status = 'succeeded'
  AND r."modelMetadata" = (${original})->'modelMetadata' AND r.result = (${original})->'result'
  AND NOT EXISTS (SELECT 1 FROM "AiRun" WHERE "retryOfRunId" = ${id})
  AND NOT EXISTS (SELECT 1 FROM "AiInvocation" WHERE "referenceId" = ${id})
  AND NOT EXISTS (SELECT 1 FROM "ResearchObservation" WHERE "runId" = ${id})
  AND NOT EXISTS (SELECT 1 FROM "OptimizationAttempt" WHERE "aiRunId" = ${id})
  AND NOT EXISTS (SELECT 1 FROM "AuditLog" WHERE "resourceId" = ${id}::text OR strpos(payload::text, ${id}::text) > 0)
  AND (SELECT array_agg(id ORDER BY id) FROM "AiToolCall" WHERE "aiRunId" = ${id})
    = ARRAY[${[...toolIds].sort().map((value) => "'" + value + "'::uuid").join(', ')}];
WITH retired AS (
  DELETE FROM "AiToolCall" WHERE "aiRunId" = ${id} AND id IN (${tools}) RETURNING id
) SELECT 1 / (count(*) = ${toolIds.length})::int FROM retired;
WITH retired AS (
  DELETE FROM "AiRun" WHERE id = ${id} RETURNING id
) SELECT 1 / count(*) FROM retired;
`;
}
