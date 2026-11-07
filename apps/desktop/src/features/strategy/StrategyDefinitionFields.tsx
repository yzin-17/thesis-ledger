import type { StrategyDefinitionField } from './strategy-version-summary.model.js';

function FieldList({ fields }: { fields: readonly StrategyDefinitionField[] }) {
  return (
    <dl className="grid min-w-0 gap-3">
      {fields.map(({ label, value }) => (
        <div key={label} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-baseline gap-x-3">
          <dt className="text-xs text-muted-foreground">{label}</dt>
          <dd className="m-0 whitespace-pre-wrap wrap-anywhere text-sm leading-relaxed">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StrategyDefinitionFields({ fields }: { fields: readonly StrategyDefinitionField[] }) {
  const groups = [
    { key: 'signals', title: '交易条件' },
    { key: 'execution', title: '仓位与执行' },
  ] as const;
  const sections = groups.map(({ key, title }) => ({ title, fields: fields.filter((row) => row.group === key) }))
    .filter((group) => group.fields.length > 0);
  return (
    <>
      <FieldList fields={fields.filter((row) => row.group === 'context')} />
      {sections.length > 0 && (
        <div className="grid min-w-0 gap-6 border-y py-5 lg:grid-cols-2 lg:gap-x-10">
          {sections.map((section) => (
            <section key={section.title} className="flex min-w-0 flex-col gap-3">
              <h3 className="text-xl font-semibold">{section.title}</h3>
              <FieldList fields={section.fields} />
            </section>
          ))}
        </div>
      )}
    </>
  );
}
