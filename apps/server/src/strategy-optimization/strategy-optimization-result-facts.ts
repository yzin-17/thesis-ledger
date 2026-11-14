import type { PrismaService } from "../platform/prisma.service.js";
import { isCurrentRunForRead } from "../backtest/backtest-current-run-read.js";
import { backtestResultSchemaV3 } from "@thesis-ledger/schemas";
import { optimizationResultFacts } from "./strategy-optimization-evaluation.js";
import {
  toRecord,
  type EnrichedCandidate,
} from "./strategy-optimization-common.js";

/** 旧评价占位不能覆盖冻结 Run；仅补充当前合同的已揭示结果，不写历史。 */
export async function projectOptimizationResultFacts(
  prisma: PrismaService,
  candidates: EnrichedCandidate[],
): Promise<EnrichedCandidate[]> {
  const missing = candidates.flatMap((candidate) => {
    if (candidate.readEligibility.state !== "readable") return [];
    return ["development", "validation", "test"].flatMap((split) => {
      const metric = toRecord(toRecord(candidate.metrics)[split]);
      const runId = toRecord(candidate.runRefs)[split];
      if (
        metric.status !== "invalid" ||
        (metric.totalReturn !== undefined &&
          typeof metric.fillCount === "number") ||
        typeof runId !== "string" ||
        metric.runId !== runId
      )
        return [];
      return [{ candidate, split, runId }];
    });
  });
  if (!missing.length) return candidates;
  const jobs = await prisma.backtestJob.findMany({
    where: { id: { in: [...new Set(missing.map((item) => item.runId))] } },
  });
  const byId = new Map(
    jobs.filter(isCurrentRunForRead).map((job) => [job.id, job]),
  );
  return candidates.map((candidate) => {
    const metrics = { ...toRecord(candidate.metrics) };
    for (const item of missing.filter(
      (entry) => entry.candidate.id === candidate.id,
    )) {
      const job = byId.get(item.runId);
      if (
        !job ||
        job.status !== "succeeded" ||
        job.strategyVersionId !== candidate.candidateStrategyVersionId
      ) {
        const unavailable = { ...toRecord(metrics[item.split]) };
        if (
          unavailable.fillCount === undefined &&
          unavailable.totalReturn === undefined
        )
          delete unavailable.tradeCount;
        metrics[item.split] = unavailable;
        continue;
      }
      const result = backtestResultSchemaV3.parse(job.result);
      metrics[item.split] = {
        ...toRecord(metrics[item.split]),
        ...optimizationResultFacts(result),
        resultCompleteness: result.completeness,
        metricSource: "frozen-run",
      };
    }
    return { ...candidate, metrics };
  });
}
