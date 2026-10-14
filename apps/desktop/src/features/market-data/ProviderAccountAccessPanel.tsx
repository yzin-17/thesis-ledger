import { useEffect, useReducer } from 'react';
import type { MarketAccountAccess, MarketProviderAccountAccessReport } from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import { accountAccessLabel, accountAccessState, nextAccountAccessRefresh } from './provider-account-access.js';
import { routeKeyIdV3, routeKeyLabelV3 } from './market-data-routes-v3.js';
import type { MarketRouteCatalogReadV3, ProviderManifest } from './market-data.types.js';

export function ProviderAccountAccessPanel({ provider, catalog, report, dirty }: {
  provider: ProviderManifest;
  catalog: MarketRouteCatalogReadV3 | undefined;
  report: MarketProviderAccountAccessReport | null;
  dirty: boolean;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const usableReport = report && (report.configVersion === provider.configVersion || provider.configVersion === undefined)
    ? report : null;
  const pending: MarketAccountAccess = { state: 'unknown', attempted: false };
  const rows = usableReport?.routes ?? catalog?.entries.filter((entry) => entry.target.providerId === provider.providerId)
    .map((entry) => ({ key: entry.key, target: entry.target,
      access: !dirty && entry.accountAccess ? entry.accountAccess : pending }));
  const expires = rows?.map((row) => row.access.validUntil).filter(Boolean).sort()[0];
  useEffect(() => {
    const delay = nextAccountAccessRefresh([expires]);
    if (delay === false || expires && Date.parse(expires) <= Date.now()) return;
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [expires]);
  if (!provider.accountAccessSupported) return null;
  return (
    <section className="flex flex-col gap-3" aria-label="账户功能权限">
      <h3 className="text-sm font-medium">账户功能权限{usableReport?.credentialContext === 'draft' ? ' · 当前输入' : ''}</h3>
      {!rows?.length && <p className="text-sm text-muted-foreground">功能目录加载中，可点击检查获取当前输入的结果。</p>}
      <ul className="flex flex-col gap-3">
        {rows?.map((row) => {
          const state = accountAccessState(row.access, Date.now(), provider.configVersion);
          let variant: 'secondary' | 'destructive' | 'outline' = 'outline';
          if (state === 'allowed') variant = 'secondary';
          else if (state === 'permission_missing' || state === 'credential_invalid') variant = 'destructive';
          return <li key={`${routeKeyIdV3(row.key)}:${row.target.upstreamSource}`} className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm">{routeKeyLabelV3(row.key)}</span>
            <Badge variant={variant}>{accountAccessLabel(row.access, Date.now(), provider.configVersion)}</Badge>
          </li>;
        })}
      </ul>
      <p className="text-xs leading-relaxed text-muted-foreground">检查只确认本次接口访问情况，有效5分钟。数据覆盖和研究资格另行判断。</p>
    </section>
  );
}
