import { useId } from 'react';
import { DateInput } from '@/components/ui/date-input';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field';

const dateLabels = {
  startDate: '开发集开始',
  developmentEnd: '开发集结束',
  validationEnd: '验证集结束',
  endDate: '封存测试结束',
} as const;
export type ExperimentDates = Record<keyof typeof dateLabels, string>;

export function StrategyExperimentDateFields({
  values,
  onChange,
  validationStart,
  testStart,
  error,
}: {
  values: ExperimentDates;
  onChange: (field: keyof ExperimentDates, value: string) => void;
  validationStart: string;
  testStart: string;
  error?: string | undefined;
}) {
  const id = useId();
  return (
    <FieldSet data-invalid={Boolean(error)}>
      <FieldLegend>连续数据区间</FieldLegend>
      <Field invalid={Boolean(error)}>
        <FieldGroup className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(Object.entries(dateLabels) as Array<[keyof ExperimentDates, string]>).map(
            ([key, label]) => (
              <Field key={key} invalid={Boolean(error)}>
                <FieldLabel htmlFor={`${id}-${key}`}>{label}</FieldLabel>
                <DateInput
                  id={`${id}-${key}`}
                  type="date"
                  aria-label={label}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? `${id}-error` : undefined}
                  value={values[key]}
                  onChange={(event) => onChange(key, event.target.value)}
                />
              </Field>
            ),
          )}
        </FieldGroup>
        <FieldDescription>
          验证集从 {validationStart} 开始，封存测试从 {testStart} 开始。
        </FieldDescription>
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </Field>
    </FieldSet>
  );
}
