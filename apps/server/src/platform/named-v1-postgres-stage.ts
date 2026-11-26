import { createInterface } from 'node:readline';
import { readdir, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { readMarketDerivedSeriesV3 } from '../market/market-derived-series-snapshot-v3.js';
import { convertPriceAcquisition } from './named-v1-market-window-conversion.js';
import { convertStrategyDefinition } from './named-v1-strategy-conversion.js';
import { convertReportMetadata } from './named-v1-report-metadata-preview.js';
import { convertNamedV1ProviderRoutes, namedV1ProviderRoutesSchema } from './named-v1-provider-conversion.js';
import { marketPolicyResponse } from '../market/market-policy-storage.js';
import { stageNamedV1StatusPolicy } from './named-v1-status-policy.js';
import { convertArenaCycle, convertArenaMatch } from './named-v1-arena-conversion.js';
import { LocalSnapshotStore } from '../backtest/backtest-snapshot.js';
import {
  convertOptimizationAdoption, convertOptimizationCandidate, convertOptimizationExperiment,
  verifyOptimizationCandidateComparisons,
  type OptimizationRunPair,
} from './named-v1-optimization-conversion.js';
import { previewTradeBacktest, type BacktestMigrationRow } from './named-v1-backtest-conversion.js';
import { rehearseBacktestArtifactConversion, type PriceAcquisition } from './named-v1-backtest-artifact-rehearsal.js';
import { convertAuthoringOperation, convertAuthoringRevision, convertSubmittedBacktest } from './named-v1-strategy-workflow-conversion.js';
import { previewResearchConversion, type ResearchMigrationRun, type ResearchMigrationCall } from './named-v1-research-conversion.js';
import { buildNamedV1PostgresPatchSql, buildNamedV1ResearchRetirementSql, namedV1PostgresPatch, type NamedV1PostgresPatch } from './named-v1-postgres-patch.js';

type Json = Record<string, unknown>;
type Selection = {
  table: NamedV1PostgresPatch['table'];
  row: Json;
  strategy?: { schemaVersion: number; definition: unknown };
  referenceWindow?: PriceAcquisition;
  calls?: ResearchMigrationCall[];
};
const [sourceRoot, stagingRoot, sqlPath, reviewedResearchId, statusPlanPath] = process.argv.slice(2);
if (!sourceRoot || !stagingRoot || !sqlPath || ![sourceRoot, stagingRoot, sqlPath].every(isAbsolute) ||
    (await readdir(stagingRoot)).length !== 0)
  throw new Error('需要绝对路径、制品备份和空隔离目录。');

const runPairs = new Map<string, OptimizationRunPair>();
const findRun = (id: string) => runPairs.get(id);
const candidatePairs = new Map<unknown, { original: Json; converted: Json }>();
const experiments = new Map<unknown, Awaited<ReturnType<typeof convertOptimizationExperiment>>>();
const originalSnapshots = new LocalSnapshotStore(sourceRoot);
const convertedSnapshots = new LocalSnapshotStore(stagingRoot);
let retainedHistoricalComparisons = 0;

async function convert({ table, row, strategy, referenceWindow }: Selection): Promise<Json> {
  switch (table) {
    case 'Strategy':
      if (row.schemaVersion !== 2 && row.schemaVersion !== 3)
        throw new Error('原策略版本标记无法识别');
      return { ...row, schemaVersion: 1 };
    case 'ArenaLiveMatch': return convertArenaMatch(row);
    case 'ArenaLiveCycle': return convertArenaCycle(row);
    case 'ModelArena': return convertArenaMatch(row, true);
    case 'StrategyVersion': {
      const result = convertStrategyDefinition(Number(row.schemaVersion), row.schema);
      if (!('definition' in result)) throw new Error(result.reason);
      return { ...row, schemaVersion: 1, schema: result.definition };
    }
    case 'BacktestJob': {
      if (!strategy) throw new Error('原作业缺少策略版本');
      const original = row as BacktestMigrationRow;
      const proposal = previewTradeBacktest(original, strategy);
      const result = proposal.outcome === 'artifacts'
        ? await rehearseBacktestArtifactConversion({
            original, converted: proposal.row, strategy, sourceRoot: sourceRoot!,
            stagingRoot: stagingRoot!, referenceWindow,
          })
        : proposal;
      if (!('row' in result)) throw new Error('原作业无法转换或制品回读失败');
      runPairs.set(original.id, { original, converted: result.row });
      return result.row;
    }
    case 'MarketBarWindowEvidenceV3': {
      if (typeof row.completeResponseHash !== 'string') throw new Error('原响应没有摘要');
      const projection = convertPriceAcquisition(row.completeResponse, row.completeResponseHash);
      return { ...row, completeResponse: projection.response, completeResponseHash: projection.responseHash };
    }
    case 'MarketDerivedSeriesSnapshotV3': {
      const snapshot = row.snapshot as Json;
      if (snapshot.contractVersion !== 3 || typeof row.inputFingerprint !== 'string')
        throw new Error('原派生序列合同或身份不符');
      const result = { ...snapshot, contractVersion: 1 };
      readMarketDerivedSeriesV3(result, row.inputFingerprint);
      return { ...row, snapshot: result };
    }
    case 'MarketReportMetadataSnapshot': {
      const result = convertReportMetadata(row);
      if (!result.payload) throw new Error(result.reason);
      return { ...row, payload: result.payload, contentHash: result.contentHash };
    }
    case 'ProviderConfig': {
      const settings = row.settings as Json;
      const result = convertNamedV1ProviderRoutes(namedV1ProviderRoutesSchema.parse(settings.executionRoutes));
      if (!result.replacement) throw new Error('Provider 用途无法保留原设置');
      return { ...row, settings: { ...settings, executionRoutes: result.replacement } };
    }
    case 'DesiredProviderPolicy':
    case 'DesiredProviderPolicyRevision': {
      const routes = row.routes as Json;
      const effective = row.effectiveProjection as Json | null;
      if (routes.storageVersion !== 3 || (effective && effective.contractVersion !== 3))
        throw new Error('原路由政策信封无法识别');
      const replacement = {
        ...row,
        routes: { ...routes, storageVersion: 'market-routing-policy-v1' },
        effectiveProjection: effective && { ...effective, contractVersion: 1 },
      };
      const verified = marketPolicyResponse(replacement);
      if (!isDeepStrictEqual(verified.routes, routes.routes) ||
          !isDeepStrictEqual(verified.effectiveProjection, replacement.effectiveProjection))
        throw new Error('当前路由政策读取改变了原目标或可用性');
      return replacement;
    }
    case 'OptimizationExperiment': {
      if (!strategy) throw new Error('缺少原实验基线');
      const result = await convertOptimizationExperiment(row, strategy, findRun, originalSnapshots, convertedSnapshots);
      experiments.set(row.id, result);
      return result.row;
    }
    case 'OptimizationCandidate': {
      if (!strategy) throw new Error('缺少原候选策略');
      const experiment = experiments.get(row.experimentId);
      if (!experiment) throw new Error('缺少候选策略的比较基线');
      retainedHistoricalComparisons += await verifyOptimizationCandidateComparisons(
        row, experiment.row, experiment.comparisons, findRun, originalSnapshots, convertedSnapshots,
      );
      const replacement = convertOptimizationCandidate(row, strategy);
      candidatePairs.set(row.id, { original: row, converted: replacement });
      return replacement;
    }
    case 'OptimizationAdoption': {
      const candidate = candidatePairs.get(row.candidateId);
      if (!candidate) throw new Error('缺少原采纳候选策略');
      return convertOptimizationAdoption(row, candidate);
    }
    case 'StrategySubmission':
    case 'StrategyAuthoringRevision':
    case 'StrategyAuthoringOperation': {
      const result = table === 'StrategySubmission' ? convertSubmittedBacktest(row) :
        table === 'StrategyAuthoringRevision' ? convertAuthoringRevision(row) : convertAuthoringOperation(row);
      if (!('row' in result)) throw new Error(result.reason);
      return result.row;
    }
    default: throw new Error('转换表未登记在本批次');
  }
}

const patches: NamedV1PostgresPatch[] = [];
const counts: Record<string, { read: number; write: number }> = {};
const blocked: Array<{ table: string; id: unknown; reason?: string }> = [];
let retirement: { id: string; toolCalls: number; sql: string } | undefined;
let statusPlan: ReturnType<typeof stageNamedV1StatusPolicy> | undefined;
for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
  const source = JSON.parse(line) as Selection;
  const countsForTable = counts[source.table] ??= { read: 0, write: 0 };
  countsForTable.read += 1;
  try {
    let converted: Json;
    if (source.table === 'AiRun') {
      if (!source.calls) throw new Error('研究缺少工具清单');
      const result = previewResearchConversion(source.row as ResearchMigrationRun, source.calls);
      if (result.outcome === 'unproven') {
        if (retirement || !reviewedResearchId || reviewedResearchId !== source.row.id ||
            source.calls.length !== 11 || !result.reason.startsWith('报告模型绑定未通过校验'))
          throw new Error('研究清理与已审阅结果不一致');
        retirement = { id: reviewedResearchId, toolCalls: source.calls.length,
          sql: buildNamedV1ResearchRetirementSql(source.row, source.calls.map(({ id }) => id)) };
        continue;
      }
      converted = result.row;
    } else converted = await convert(source);
    if (source.table === 'DesiredProviderPolicy' && statusPlanPath) statusPlan = stageNamedV1StatusPolicy(converted);
    const patch = namedV1PostgresPatch(source.table, source.row, converted);
    if (patch) {
      patches.push(patch);
      countsForTable.write += 1;
    }
  } catch (error) {
    const reason = (source.table === 'OptimizationExperiment' || source.table === 'OptimizationCandidate') && error instanceof Error
      ? error.message.match(/^(?:原(?:冻结分区|候选分区)[^：]*|原优化实验配置摘要不一致|候选分区与基线的可比性在转换后改变)(?:：(development|validation|test))?$/u)?.[0]
      : undefined;
    blocked.push({ table: source.table, id: source.row.id ?? source.row.consumer ?? source.row.draftId ??
      source.row.identityFingerprint ?? source.row.inputFingerprint, ...(reason ? { reason } : {}) });
  }
}
const summary = { contract: 'named-v1-postgres-stage-v1', counts, blocked, retainedHistoricalComparisons,
  retiredResearch: retirement && { id: retirement.id, toolCalls: retirement.toolCalls } };
console.log(JSON.stringify(summary));
if (blocked.length || !Object.keys(counts).length || Boolean(reviewedResearchId) !== Boolean(retirement) ||
    Boolean(statusPlanPath) !== Boolean(statusPlan))
  process.exitCode = 1;
else {
  await writeFile(sqlPath, buildNamedV1PostgresPatchSql(patches) + (retirement?.sql ?? ''), { mode: 0o600, flag: 'wx' });
  if (statusPlanPath) await writeFile(statusPlanPath, JSON.stringify(statusPlan), { mode: 0o600, flag: 'wx' });
}
