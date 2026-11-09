import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { notificationRouteLabel } from './risk.format.js';
import { useRiskNotificationRoutingQuery } from './risk.queries.js';
import { useSaveRiskNotificationRoutingMutation } from './risk.mutations.js';

function useProviderSelection() {
  const query = useRiskNotificationRoutingQuery();
  const save = useSaveRiskNotificationRoutingMutation();
  const [draft, setDraft] = useState<string[] | null>(null);
  const routes = query.data?.availableRoutes ?? [];
  const selected = draft ?? query.data?.selectedProviders ?? [];
  const items = routes.map((route) => ({ value: route.provider, label: notificationRouteLabel(route) }));
  const missing = selected.filter((name) => !items.some((item) => item.value === name));
  const disabled = query.isPending || query.isError || save.isPending || routes.length === 0;
  let placeholder = '选择通知提供方';
  if (query.isPending) placeholder = '正在读取通知提供方…';
  else if (query.isError) placeholder = '通知提供方读取失败';
  else if (routes.length === 0) placeholder = '没有可用的通知提供方';

  const canSave = !disabled && draft !== null && selected.length > 0 && missing.length === 0;
  return { query, save, draft, setDraft, selected, items, missing, disabled, placeholder, canSave };
}

export function RiskNotificationProviderPicker() {
  const { query, save, draft, setDraft, selected, items, missing, disabled, placeholder, canSave } = useProviderSelection();
  return (
    <Field className="mb-group">
      <FieldLabel id="risk-notification-provider-label">通知提供方</FieldLabel>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          multiple
          items={items}
          value={selected.filter((name) => items.some((item) => item.value === name))}
          disabled={disabled}
          onValueChange={(value) => { setDraft(value); save.reset(); }}
        >
          <SelectTrigger aria-labelledby="risk-notification-provider-label" className="w-full sm:w-80">
            {query.isPending && <Spinner aria-hidden="true" />}
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectGroup>
              {items.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}
            </SelectGroup>
          </SelectContent>
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!canSave}
          onClick={() => save.mutate(selected, { onSuccess: () => setDraft(null) })}
        >
          {save.isPending && <Spinner aria-hidden="true" />}
          {save.isPending ? '保存中…' : '保存'}
        </Button>
        {query.isError && <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>重新读取</Button>}
        {save.isSuccess && draft === null && <span role="status" className="text-xs text-muted-foreground">已保存</span>}
      </div>
      {missing.length > 0 && <p role="alert" className="text-xs text-destructive">已选提供方当前不可用：{missing.join('、')}。请重新选择。</p>}
      {draft !== null && selected.length === 0 && <p role="alert" className="text-xs text-destructive">请至少选择一个通知提供方。</p>}
      {save.isError && <p role="alert" className="text-xs text-destructive">保存失败，选择已保留，请重试。</p>}
      <FieldDescription>用于后续风险通知。通知失败不会回滚已写入的风险事件。</FieldDescription>
    </Field>
  );
}
