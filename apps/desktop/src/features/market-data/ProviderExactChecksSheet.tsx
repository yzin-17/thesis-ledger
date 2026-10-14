import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { MarketProviderProbeRoute } from '@thesis-ledger/schemas';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { testMarketProvider } from './market-data.api.js';
import { providerProbeErrorLabel } from './provider-credentials.js';
import { routeKeyLabelV3, routeAvailabilityLabelV3 } from './market-data-routes-v3.js';
import {
  dataSourceDisplay,
  type ProviderManifest,
  type MarketRouteCatalogReadV3,
} from './market-data.types.js';

const identity = (route: MarketProviderProbeRoute) => JSON.stringify([route.key, route.target]);

export function ProviderExactChecksSheet({
  provider,
  catalog,
  onClose,
  onConfigure,
}: {
  provider: ProviderManifest;
  catalog: MarketRouteCatalogReadV3 | undefined;
  onClose: () => void;
  onConfigure: () => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const entries =
    catalog?.status === 'complete'
      ? catalog.entries.filter((entry) => entry.target.providerId === provider.providerId)
      : [];
  const selected = entries.find((entry) => identity(entry) === selectedId) ?? entries[0];
  const options = entries.map((entry) => ({
    value: identity(entry),
    label: `${routeKeyLabelV3(entry.key)} · ${dataSourceDisplay(entry.target.providerId, entry.target.upstreamSource, [provider])}`,
  }));
  const test = useMutation({
    mutationFn: (route: MarketProviderProbeRoute) =>
      testMarketProvider(provider, undefined, undefined, route),
    retry: false,
  });
  const checked =
    selected && test.data?.routeResults?.find((entry) => identity(entry) === identity(selected));
  const state = checked?.state ?? selected?.state;
  const credentialMissing = provider.requiresCredential === true && !provider.credentialConfigured;
  let availability = routeAvailabilityLabelV3(state);
  if (state === 'ready') availability = '配置与当前检查条件就绪';
  else if (!provider.enabled && !credentialMissing) availability = '来源未启用';
  let resultMessage = '尚未执行所选能力的读取检查。';
  if (test.isPending) resultMessage = '正在检查所选来源…';
  else if (test.isError)
    resultMessage = test.error instanceof Error ? test.error.message : '检查失败，请稍后重试。';
  else if (checked?.result.status === 'healthy') resultMessage = '所选能力读取检查通过。';
  else if (checked) resultMessage = providerProbeErrorLabel(checked.result.errorCode);

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent size="compact">
        <SheetHeader>
          <SheetTitle>{provider.displayName} 精确能力检查</SheetTitle>
          <SheetDescription>检查结果仅对应所选市场、资产、上游和价格口径。</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{entries.length} 项精确能力</Badge>
            <Badge variant="outline">{provider.enabled ? '已启用' : '未启用'}</Badge>
            <Badge variant="outline">{credentialMissing ? '凭据缺失' : '配置就绪'}</Badge>
          </div>
          <Select
            items={options}
            value={selected ? identity(selected) : null}
            disabled={test.isPending || options.length === 0}
            onValueChange={(value) => {
              setSelectedId(value);
              test.reset();
            }}
          >
            <SelectTrigger className="w-full" aria-label="检查能力">
              <SelectValue placeholder="选择精确能力" />
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false}>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {state && <p className="text-sm text-muted-foreground">当前能力状态：{availability}</p>}
          <p role="status" className="text-sm">
            {resultMessage}
          </p>
          {checked?.sample && (
            <p className="text-xs text-muted-foreground">
              检查标的：{checked.sample.symbol}
              {checked.sample.start &&
                checked.sample.end &&
                `；区间：${checked.sample.start}～${checked.sample.end}`}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              disabled={!selected || test.isPending}
              onClick={() => {
                if (selected) test.mutate({ key: selected.key, target: selected.target });
              }}
            >
              检查所选能力
            </Button>
            {(provider.credentialSchema?.methods.length ?? 0) > 0 && (
              <Button variant="outline" disabled={test.isPending} onClick={onConfigure}>
                配置凭证
              </Button>
            )}
          </div>
          {options.length === 0 && (
            <p className="text-sm text-muted-foreground">精确目录尚未就绪。</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
