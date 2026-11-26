import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  LocalSnapshotStore,
  hashCanonicalManifest,
} from "../../src/backtest/backtest-snapshot.js";
import { LocalSnapshotV3Runner } from "../../src/backtest/backtest-v3-runner.js";
import { DsaSnapshotBuilder } from "../../src/backtest/backtest-snapshot-builder.js";
import { completeSnapshotFixture } from "../backtest/v3-complete-snapshot-fixtures.js";
import { projectOptimizationResultFacts } from "../../src/strategy-optimization/strategy-optimization-result-facts.js";
import type { EnrichedCandidate } from "../../src/strategy-optimization/strategy-optimization-common.js";

describe("已有评价的冻结 Run 事实读取", () => {
  let root: string, job: Record<string, unknown>, candidate: EnrichedCandidate;
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), "optimization-result-facts-"));
    const fixture = await completeSnapshotFixture(),
      input = fixture.input;
    input.strategyVersionHash = hashCanonicalManifest(input.strategy);
    const snapshots = new LocalSnapshotStore(root);
    const built = await new DsaSnapshotBuilder(
      fixture.dsa as never,
      snapshots,
      fixture.reader,
    ).buildV3(input);
    const result = await new LocalSnapshotV3Runner(snapshots).run(
      {
        runId: input.runId,
        snapshotRef: built.snapshotRef,
        artifactRefs: built.artifactRefs,
      },
      new AbortController().signal,
    );
    job = {
      id: input.runId,
      mode: 'frozen',
      status: "succeeded",
      strategyVersionId: input.strategyVersionId,
      input: {
        contractVersion: 1,
        schemaVersion: "backtest-trade-run-v1",
        runConfig: input.runConfig,
        snapshotId: built.snapshotRef.snapshotId,
        snapshotVersion: built.manifest.manifestVersion,
      },
      runConfig: input.runConfig,
      snapshotId: built.snapshotRef.snapshotId,
      snapshotManifest: built.manifest,
      result,
      resultChecksum: result.resultChecksum,
    };
    candidate = {
      id: "candidate",
      candidateStrategyVersionId: input.strategyVersionId,
      readEligibility: { state: "readable" },
      runRefs: { test: input.runId },
      metrics: {
        test: {
          runId: input.runId,
          status: "invalid",
          tradeCount: 0,
          reason: "原指纹不一致",
        },
      },
    } as unknown as EnrichedCandidate;
  });
  afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });
  it("批量读取真实值并保留原评价，不写入历史", async () => {
    const original = structuredClone(candidate),
      findMany = vi.fn(async () => [job]);
    const [read] = await projectOptimizationResultFacts(
      { backtestJob: { findMany } } as never,
      [candidate],
    );
    expect(read!.metrics).toMatchObject({
      test: {
        status: "invalid",
        reason: "原指纹不一致",
        metricSource: "frozen-run",
        totalReturn: expect.any(String),
      },
    });
    expect(findMany).toHaveBeenCalledTimes(1);
    expect(candidate).toEqual(original);
  });
  it("隐藏结果不读取 Run；错版本或损坏结果不能补充指标", async () => {
    const findMany = vi.fn(async () => [
      { ...job, strategyVersionId: "wrong-version" },
    ]);
    const hidden = {
      ...candidate,
      readEligibility: { state: "restricted" },
    } as EnrichedCandidate;
    expect(
      await projectOptimizationResultFacts(
        { backtestJob: { findMany } } as never,
        [hidden],
      ),
    ).toEqual([hidden]);
    expect(findMany).not.toHaveBeenCalled();
    const [read] = await projectOptimizationResultFacts(
      { backtestJob: { findMany } } as never,
      [candidate],
    );
    expect(read!.metrics).toMatchObject({
      test: { reason: "原指纹不一致", status: "invalid" },
    });
    expect((read!.metrics as Record<string, unknown>).test).not.toHaveProperty(
      "tradeCount",
    );
  });
});
