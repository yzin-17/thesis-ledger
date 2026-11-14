import { Button } from '@/components/ui/button';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  chargeCategoryLabel,
  chargeCategoryOptions,
  currencies,
  isCurrency,
} from './account-data.helpers.js';
import type { ChargeDraft } from './account-data.types.js';
import type { useExecutionForm } from './use-execution-form.js';

function ExecutionCharges({ control }: { control: ReturnType<typeof useExecutionForm> }) {
  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="m-0 text-sm font-semibold">费用明细</h3>
            <p className="m-0 mt-1 text-xs text-muted-foreground">
              没有费用时可以留空；每行金额必须大于 0。
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              control.setCharges((current) => [
                ...current,
                {
                  category: 'COMMISSION',
                  amount: '',
                  currency: control.draft.currency,
                  description: '',
                },
              ]);
              control.updateDirty(true);
            }}
          >
            添加费用
          </Button>
        </div>
        <FieldGroup className="gap-4">
          {control.charges.length === 0 && (
            <p className="m-0 text-xs text-muted-foreground">暂无费用明细</p>
          )}
          {control.charges.map((charge, index) => (
            <FieldGroup
              key={`${index}-${charge.category}`}
              className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]"
            >
              <Field>
                <FieldLabel htmlFor={`charge-category-${index}`}>类别</FieldLabel>
                <Select
                  value={charge.category}
                  onValueChange={(value) => {
                    control.setCharges((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, category: value as ChargeDraft['category'] }
                          : item,
                      ),
                    );
                    control.updateDirty(true);
                  }}
                >
                  <SelectTrigger id={`charge-category-${index}`} className="w-full">
                    <SelectValue>{chargeCategoryLabel(charge.category)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {chargeCategoryOptions.map(({ value, label }) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor={`charge-amount-${index}`}>金额</FieldLabel>
                <Input
                  id={`charge-amount-${index}`}
                  inputMode="decimal"
                  value={charge.amount}
                  onChange={(event) => {
                    control.setCharges((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, amount: event.target.value } : item,
                      ),
                    );
                    control.updateDirty(true);
                  }}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`charge-currency-${index}`}>币种</FieldLabel>
                <Select
                  value={charge.currency}
                  onValueChange={(value) => {
                    if (!isCurrency(value)) return;
                    control.setCharges((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, currency: value } : item,
                      ),
                    );
                    control.updateDirty(true);
                  }}
                >
                  <SelectTrigger id={`charge-currency-${index}`} className="w-full">
                    <SelectValue>{charge.currency}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {currencies.map((currency) => (
                        <SelectItem key={currency} value={currency}>
                          {currency}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field className="justify-end">
                <FieldLabel className="sr-only" htmlFor={`remove-charge-${index}`}>
                  费用操作
                </FieldLabel>
                <Button
                  id={`remove-charge-${index}`}
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`移除第 ${index + 1} 条费用`}
                  onClick={() => {
                    control.setCharges((current) =>
                      current.filter((_, itemIndex) => itemIndex !== index),
                    );
                    control.updateDirty(true);
                  }}
                >
                  ×
                </Button>
              </Field>
              <Field className="sm:col-span-3">
                <FieldLabel className="sr-only" htmlFor={`charge-description-${index}`}>
                  费用说明
                </FieldLabel>
                <Input
                  id={`charge-description-${index}`}
                  aria-label={`第 ${index + 1} 条费用说明`}
                  value={charge.description}
                  placeholder="说明（可选）"
                  onChange={(event) => {
                    control.setCharges((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, description: event.target.value } : item,
                      ),
                    );
                    control.updateDirty(true);
                  }}
                />
              </Field>
            </FieldGroup>
          ))}
        </FieldGroup>
      </div>
    </>
  );
}

export { ExecutionCharges };
