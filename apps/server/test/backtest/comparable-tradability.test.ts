import { MARKET_DAILY_TRADABILITY_CONTRACT } from "@thesis-ledger/schemas";
import { describe, expect, it } from "vitest";
import { comparableTradabilityWindows } from "../../src/backtest/backtest-comparable-tradability.js";

const evidence = (start: string) => ({
  contract: MARKET_DAILY_TRADABILITY_CONTRACT,
  priceOnlyAllowed: false,
  symbol: "00700.HK",
  market: "HK",
  instrumentType: "STOCK",
  range: { start, end: "2026-08-18" },
  listing: { status: "unknown" },
  calendar: {
    expectedSessions: [start, "2026-08-17", "2026-08-18"],
    source: {
      provider: "calendar",
      revision: "1",
      availableAt: "2026-11-12T00:00:00Z",
    },
  },
  barSource: {
    routeKey: {
      kind: "bar",
      market: "HK",
      assetType: "STOCK",
      capability: "DAILY_BAR",
      timeframe: "1d",
      adjustment: "hfq",
    },
    routeTarget: { providerId: "futu", upstreamSource: "futu" },
    providerRevision: "1",
    responseSha256: "a".repeat(64),
    observedAt: "2026-11-12T00:00:00Z",
    requestComplete: true,
    paginationComplete: true,
  },
  days: [start, "2026-08-17", "2026-08-18"].map((date) => ({
    date,
    state: "observed-traded",
  })),
});
const range = { start: "2026-08-17", end: "2026-08-18" };
const compare = (value: unknown) =>
  comparableTradabilityWindows(JSON.stringify([value]), range);

describe("比较区间的嵌套交易状态证据", () => {
  it("不同预热区间不会改变实际比较期，原始证据不变", () => {
    const baseline = evidence("2026-08-13"),
      candidate = evidence("2026-08-14");
    const original = structuredClone(candidate);
    expect(compare(candidate)).toBe(compare(baseline));
    expect(candidate).toEqual(original);
  });
  it("区间内状态、来源和响应摘要变化仍可辨认", () => {
    const original = evidence("2026-08-13");
    for (const field of ["state", "provider", "hash"]) {
      const changed = structuredClone(original);
      if (field === "state")
        changed.days[1]!.state = "assumed-untradable-no-bar";
      if (field === "provider")
        changed.barSource.routeTarget.providerId = "other";
      if (field === "hash") changed.barSource.responseSha256 = "b".repeat(64);
      expect(compare(changed)).not.toBe(compare(original));
    }
  });
});
