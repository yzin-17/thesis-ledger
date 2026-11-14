import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { MultiSelect } from '@/components/ui/multi-select';
import { Button } from '@/components/ui/button';
import { notificationRouteLabel } from './risk.format.js';
import type { NotificationRouteRecord } from './risk.types.js';
import type { NotificationRoutingState } from './NotificationRouteSelect.js';

export function NotificationProviderSelect({
  routes,
  value,
  onChange,
  state,
  disabled = false,
  onRetry,
}: {
  routes: NotificationRouteRecord[];
  value: string[];
  onChange: (value: string[]) => void;
  state: NotificationRoutingState;
  disabled?: boolean;
  onRetry?: (() => void) | undefined;
}) {
  let placeholder = '选择通知提供方';
  if (state === 'loading') placeholder = '正在读取通知提供方…';
  else if (state === 'error') placeholder = '通知提供方读取失败';
  else if (!routes.length) placeholder = '没有可用的通知提供方';
  const missing = value.filter((name) => !routes.some((route) => route.provider === name));
  return (
    <Field className="min-w-0">
      <FieldLabel>通知提供方</FieldLabel>
      <MultiSelect
        label="通知提供方"
        options={routes.map((route) => ({
          value: route.provider,
          label: notificationRouteLabel(route),
        }))}
        value={value}
        onValueChange={onChange}
        placeholder={placeholder}
        disabled={disabled || state !== 'ready'}
      />
      {state === 'error' && onRetry ? (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          重新读取通知提供方
        </Button>
      ) : null}
      {state === 'ready' && missing.length > 0 ? (
        <p role="alert" className="text-xs text-destructive">
          已选提供方当前不可用：{missing.join('、')}。请重新选择。
        </p>
      ) : null}
      <FieldDescription>不选择提供方时不发送通知，监控和事件仍继续。</FieldDescription>
    </Field>
  );
}
