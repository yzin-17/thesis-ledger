import type { ExecutionCharge } from '@thesis-ledger/schemas';
import { Action, Choices, Field, Section } from '../../components/MobilePrimitives';
const categories: Array<{ value: ExecutionCharge['category']; label: string }> = [
  { value: 'COMMISSION', label: '佣金' },
  { value: 'TAX', label: '税费' },
  { value: 'LEVY', label: '征费' },
  { value: 'EXCHANGE', label: '交易所费用' },
  { value: 'REGULATORY', label: '监管费' },
  { value: 'OTHER', label: '其他费用' },
];
export function ExecutionCharges({
  charges,
  currency,
  disabled,
  onChange,
}: {
  charges: ExecutionCharge[];
  currency: ExecutionCharge['currency'];
  disabled: boolean;
  onChange: (value: ExecutionCharge[]) => void;
}) {
  const change = (index: number, value: Partial<ExecutionCharge>) =>
    onChange(charges.map((charge, i) => (i === index ? { ...charge, ...value } : charge)));
  const describe = (index: number, description: string) =>
    onChange(
      charges.map((charge, i) => {
        if (i !== index) return charge;
        const next = { ...charge };
        if (description) next.description = description;
        else delete next.description;
        return next;
      }),
    );
  return (
    <Section title="成交费用">
      {charges.map((charge, index) => (
        <Section key={index} title={`费用 ${index + 1}`}>
          <Choices
            label="费用类别"
            value={charge.category}
            options={categories}
            onChange={(category) => change(index, { category })}
            disabled={disabled}
          />
          <Field
            label={`费用 ${index + 1} 金额`}
            value={charge.amount}
            onChange={(amount) => change(index, { amount })}
            keyboardType="decimal-pad"
            editable={!disabled}
          />
          <Field
            label={`费用 ${index + 1} 说明（可选）`}
            value={charge.description ?? ''}
            onChange={(description) => describe(index, description)}
            editable={!disabled}
          />
          <Choices
            label="费用币种"
            value={charge.currency}
            options={[
              { value: 'CNY', label: '人民币' },
              { value: 'HKD', label: '港币' },
              { value: 'USD', label: '美元' },
            ]}
            onChange={(value) => change(index, { currency: value })}
            disabled={disabled}
          />
          <Action
            label={`移除费用 ${index + 1}`}
            onPress={() => onChange(charges.filter((_, i) => i !== index))}
            disabled={disabled}
          />
        </Section>
      ))}
      <Action
        label="添加费用"
        disabled={disabled}
        onPress={() => onChange([...charges, { category: 'COMMISSION', amount: '', currency }])}
      />
    </Section>
  );
}
