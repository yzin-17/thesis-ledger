export function ExperimentEvaluationNote({
  metrics,
}: {
  metrics: Record<string, unknown>;
}) {
  const noClosedTrades =
    metrics.tradeCount === 0 &&
    typeof metrics.fillCount === "number" &&
    metrics.fillCount > 0;
  const reason = typeof metrics.reason === "string" ? metrics.reason : null;
  return (
    <div className="mt-1 flex min-w-48 max-w-64 flex-col gap-1 whitespace-normal break-words text-xs text-muted-foreground">
      {noClosedTrades ? (
        <p>期末仍有持仓，收益包含未实现盈亏；暂无已平仓交易。</p>
      ) : null}
      {reason ? (
        <p>
          {metrics.metricSource === "frozen-run" ? "历史评价：" : "评价说明："}
          {reason}
        </p>
      ) : null}
    </div>
  );
}
