import { optimizationBudgetLimits } from '@thesis-ledger/schemas';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  experimentBudgetLabels,
  experimentBudgetRangeMessage,
  type ExperimentBudgetDraft,
  type ExperimentBudgetField,
} from './experiment-budget.js';

export function ExperimentBudgetFields({
  value,
  onChange,
}: {
  value: ExperimentBudgetDraft;
  onChange: (field: ExperimentBudgetField, value: string) => void;
}) {
  return Object.entries(experimentBudgetLabels).map(([key, label]) => {
    const field = key as ExperimentBudgetField;
    const limits = optimizationBudgetLimits[field];
    const number = Number(value[field]);
    const unlimited = 'unlimited' in limits && number === limits.unlimited;
    const invalid =
      !value[field].trim() ||
      (!unlimited && (!Number.isInteger(number) || number < limits.min || number > limits.max));
    const description = experimentBudgetRangeMessage(field);
    return (
      <Field key={field} invalid={invalid}>
        <FieldLabel>{label}</FieldLabel>
        <Input
          aria-label={label}
          type="number"
          min={'unlimited' in limits ? limits.unlimited : limits.min}
          max={limits.max}
          step={1}
          value={value[field]}
          aria-invalid={invalid}
          onChange={(event) => onChange(field, event.target.value)}
        />
        {invalid ? (
          <FieldError>{description}</FieldError>
        ) : (
          <FieldDescription>{description}</FieldDescription>
        )}
      </Field>
    );
  });
}
