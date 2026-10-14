import { strategyVersionSummary } from '../strategy/strategy-version-summary.model.js';

export function AuthoringSaveReview({
  definition,
  revision,
}: {
  definition: Record<string, unknown>;
  revision: number;
}) {
  const summary = strategyVersionSummary({ id: 'review', version: 0, schema: definition });
  const cost = definition.cost as { commissionRate: string; slippageRate: string };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        审核修订 {revision}。改变任何输入后需重新审核。
      </p>
      {summary.kind === 'ready' && (
        <dl className="grid gap-3 sm:grid-cols-2">
          {summary.sections.map((section) => (
            <div key={section.label}>
              <dt className="text-sm text-muted-foreground">{section.label}</dt>
              <dd className="text-sm">{section.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="text-sm">
        成本：佣金 {cost.commissionRate} · 滑点 {cost.slippageRate}
      </p>
    </div>
  );
}
