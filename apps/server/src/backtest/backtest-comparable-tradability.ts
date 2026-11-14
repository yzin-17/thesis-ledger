import {
  backtestDailyTradabilityEvidenceV3Schema,
  sliceTradabilityWindowsV3,
} from "@thesis-ledger/schemas";
import { canonicalizeManifest } from "./backtest-snapshot.js";

/** 只裁剪比较视图；完整冻结证据仍由快照校验，不改原始产物。 */
export function comparableTradabilityWindows(
  encoded: string,
  range: { start: string; end: string },
): string {
  const values: unknown = JSON.parse(encoded);
  if (!Array.isArray(values)) throw new Error("比较用交易状态证据必须为数组");
  const windows = values.map((value) =>
    backtestDailyTradabilityEvidenceV3Schema.parse(value),
  );
  return canonicalizeManifest(sliceTradabilityWindowsV3(windows, range));
}
