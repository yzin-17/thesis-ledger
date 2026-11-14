import type { ArenaBinding } from '@thesis-ledger/api-client';
import { MultiSelect } from '@/components/ui/multi-select';

export function ArenaModelSelector({ choices, value, onChange }: {
  choices: ArenaBinding[];
  value: ArenaBinding[];
  onChange: (value: ArenaBinding[]) => void;
}) {
  const key = (item: ArenaBinding) => JSON.stringify([item.providerId, item.model]);
  const models = new Map([...choices, ...value].map((item) => [key(item), item]));
  return <MultiSelect label="搜索参赛模型"
    options={[...models].map(([id, item]) => ({ value: id, label: `${item.model} · ${item.providerId}`,
      disabled: !choices.some((choice) => key(choice) === id) }))}
    value={value.map(key)}
    onValueChange={(keys) => onChange(keys.flatMap((id) => {
      const item = models.get(id);
      return item ? [item] : [];
    }))} />;
}
