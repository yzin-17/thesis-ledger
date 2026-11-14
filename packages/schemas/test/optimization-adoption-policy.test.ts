import { describe, expect, it } from "vitest";
import { candidateAdoptionEligibility } from "../src/strategy-optimization-read-policy.js";
import { optimizationAdoptionDiffEntrySchema } from "../src/strategy-optimization.js";

const experiment = {
  status: "succeeded",
  stage: "completed",
  readEligibility: { state: "readable" as const },
};
const candidate = (validationStatus: string) => ({
  id: "candidate",
  validationStatus,
  metrics: {},
  readEligibility: { state: "readable" as const },
});
describe("完成候选的采纳与评分分离", () => {
  it("新增与删除字段可在 JSON 传输后读取，双侧缺失仍拒绝", () => {
    for (const entry of [{ path: '$.risk', before: undefined, after: [] }, { path: '$.entry.left', before: { type: 'constant', value: '1' }, after: undefined }]) {
      expect(optimizationAdoptionDiffEntrySchema.safeParse(JSON.parse(JSON.stringify(entry))).success).toBe(true);
    }
    expect(optimizationAdoptionDiffEntrySchema.safeParse({ path: '$.risk' }).success).toBe(false);
  });
  it.each(["valid", "invalid", "test_valid", "test_invalid"])(
    "%s 均可保存正式策略",
    (status) => {
      expect(
        candidateAdoptionEligibility(
          experiment as never,
          candidate(status) as never,
        ),
      ).toBeNull();
    },
  );
  it.each(["queued", "evaluating", "test_running", "test_failed"])(
    "%s 尚未完成，不能采纳",
    (status) => {
      expect(
        candidateAdoptionEligibility(
          experiment as never,
          candidate(status) as never,
        ),
      ).toBe("候选评估尚未完成");
    },
  );
  it("未完成实验与未揭示结果仍不能采纳", () => {
    expect(
      candidateAdoptionEligibility(
        { ...experiment, stage: "testing" } as never,
        candidate("valid") as never,
      ),
    ).toBeTruthy();
    expect(
      candidateAdoptionEligibility(
        { ...experiment, readEligibility: { state: "restricted" } } as never,
        candidate("valid") as never,
      ),
    ).toBe("封存测试结果尚未揭示");
  });
});
