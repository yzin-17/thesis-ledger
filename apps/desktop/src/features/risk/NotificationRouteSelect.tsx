import { FieldDescription } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { notificationRouteLabel } from './risk.format.js';
import type { NotificationRouteRecord } from './risk.types.js';

export type NotificationRoutingState = 'loading' | 'ready' | 'error';

export function NotificationRouteSelect({
  routes,
  routingState,
  value,
  onValueChange,
  ariaLabel,
  disabled = false,
}: {
  routes: NotificationRouteRecord[];
  routingState: NotificationRoutingState;
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const selectedRoute = routes.find((route) => route.channel === value);
  let placeholder = '选择通知 Provider';
  let description = '仅展示已配置、已启用且凭证有效的通知 Provider。';
  if (routingState === 'loading') {
    placeholder = '正在读取通知 Provider…';
    description = '正在确认当前可投递的通知 Provider。';
  } else if (routingState === 'error') {
    placeholder = '通知 Provider 读取失败';
    description = '暂时无法确认可投递的通知 Provider，请稍后重试。';
  } else if (routes.length === 0) {
    placeholder = '没有可用的通知 Provider';
    description = '请先在 Provider 页面配置并启用消息 Provider。';
  } else if (selectedRoute) {
    description = `当前使用 ${notificationRouteLabel(selectedRoute)}。`;
  }

  return (
    <>
      <Select
        items={routes.map((route) => ({
          label: notificationRouteLabel(route),
          value: route.channel,
        }))}
        value={selectedRoute?.channel ?? null}
        onValueChange={(nextValue) => {
          if (nextValue) onValueChange(nextValue);
        }}
        disabled={disabled || routingState !== 'ready' || routes.length === 0}
      >
        <SelectTrigger aria-label={ariaLabel} className="w-full">
          <SelectValue placeholder={placeholder}>
            {selectedRoute ? notificationRouteLabel(selectedRoute) : placeholder}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {routes.map((route) => (
              <SelectItem key={`${route.channel}:${route.provider}`} value={route.channel}>
                {notificationRouteLabel(route)}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      <FieldDescription>{description}</FieldDescription>
    </>
  );
}
