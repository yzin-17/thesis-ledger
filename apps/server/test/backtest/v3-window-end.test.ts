import { describe, expect, it } from "vitest";
import { projectV3SimulationRejects } from "../../src/backtest/backtest-v3-runner.js";

describe("回测窗口结束时的未执行信号", () => {
  const reject = {
    rejectionId: "rejection",
    orderId: "sell",
    side: "sell" as const,
    code: "DAY_EXPIRED" as const,
    reason: "没有下一根可执行 Bar",
    occurredAt: "2026-11-11T08:00:00.000Z",
    availableAt: "2026-11-11T08:00:00.000Z",
  };
  it("期末保留未执行信号，不投影成市场过期拒单", () => {
    expect(
      projectV3SimulationRejects([reject], "00700.HK", reject.occurredAt)
        .rejectedOrders,
    ).toMatchObject([
      {
        side: "sell",
        reasonCode: "BACKTEST_WINDOW_ENDED",
        message: expect.stringContaining("期末持仓按市值估值"),
      },
    ]);
    expect(reject.code).toBe("DAY_EXPIRED");
  });
  it("窗口内过期与缺乏结束时点证据时仍保留原始原因", () => {
    for (const end of [undefined, "2026-11-12T08:00:00.000Z"]) {
      expect(
        projectV3SimulationRejects([reject], "00700.HK", end).rejectedOrders,
      ).toMatchObject([{ reasonCode: "DAY_EXPIRED" }]);
    }
  });
});
