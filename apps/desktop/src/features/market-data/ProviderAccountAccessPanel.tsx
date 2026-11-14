import { useEffect, useReducer } from 'react';
import { formatDateTime } from '@/lib/date-display';
import type {
  MarketAccountAccess,
  MarketProviderAccountAccessReport,
} from '@thesis-ledger/schemas';
import { Badge } from '@/components/ui/badge';
import {
  accountAccessLabel,
  accountAccessState,
  nextAccountAccessRefresh,
} from './provider-account-access.js';
import { routeKeyIdV3, routeKeyLabelV3 } from './market-data-routes-v3.js';
import type { MarketRouteCatalogReadV3, ProviderManifest } from './market-data.types.js';

export function ProviderAccountAccessPanel({
  provider,
  catalog,
  report,
  dirty,
}: {
  provider: ProviderManifest;
  catalog: MarketRouteCatalogReadV3 | undefined;
  report: MarketProviderAccountAccessReport | null;
  dirty: boolean;
}) {
  const [, refresh] = useReducer((value: number) => value + 1, 0);
  const { usableReport, rows, expires, checkedAt } = accountAccessEvidence(
    provider,
    catalog,
    report,
    dirty,
  );
  useEffect(() => {
    const delay = nextAccountAccessRefresh([expires]);
    if (delay === false || (expires && Date.parse(expires) <= Date.now())) return;
    const timer = setTimeout(refresh, delay);
    return () => clearTimeout(timer);
  }, [expires]);
  if (!provider.accountAccessSupported) return null;
  const { allowed, excluded, limited, incomplete } = accountAccessSummary(
    rows,
    provider.configVersion,
  );
  return (
    <section className="flex flex-col gap-3" aria-label="账户功能权限">
      <h3 className="text-sm font-medium">
        功能权限{usableReport?.credentialContext === 'draft' ? ' · 当前输入' : ''}
      </h3>
      {!rows?.length && (
        <p className="text-sm text-muted-foreground">暂无已确认的功能，可检查当前输入。</p>
      )}
      {!!rows?.length && (
        <p className="text-sm text-muted-foreground">
          已确认可用 {allowed} / {rows.length} 项
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {rows?.map((row) => {
          const state = accountAccessState(row.access, Date.now(), provider.configVersion);
          let variant: 'secondary' | 'destructive' | 'outline' = 'outline';
          if (state === 'allowed') variant = 'secondary';
          else if (state === 'permission_missing' || state === 'credential_invalid')
            variant = 'destructive';
          return (
            <li
              key={`${routeKeyIdV3(row.key)}:${row.target.upstreamSource}`}
              className="flex flex-wrap items-center justify-between gap-2"
            >
              <span className="text-sm">{routeKeyLabelV3(row.key)}</span>
              <Badge variant={variant}>
                {accountAccessLabel(row.access, Date.now(), provider.configVersion)}
              </Badge>
            </li>
          );
        })}
      </ul>
      {!!excluded && (
        <p className="text-xs text-muted-foreground">
          当前等级未包含 {excluded} 项功能，已跳过检查。
        </p>
      )}
      {limited && (
        <p className="text-xs text-muted-foreground">限频接口已暂停，冷却期间不会重复请求。</p>
      )}
      {incomplete && (
        <p className="text-xs text-muted-foreground">再次检查只补查待确认功能，保留已确认结果。</p>
      )}
      {checkedAt && (
        <p className="text-xs text-muted-foreground">
          最近检查：<time dateTime={checkedAt}>{formatDateTime(checkedAt)}</time>
        </p>
      )}
      <p className="text-xs leading-relaxed text-muted-foreground">
        {dirty || usableReport?.credentialContext === 'draft'
          ? '未保存输入的检查结果仅供本次编辑，不会覆盖当前配置的长期记录。'
          : '检查结果长期保留，凭证变更后需重新检查；权限变化时可手动更新。'}
      </p>
    </section>
  );
}

function accountAccessEvidence(
  provider: ProviderManifest,
  catalog: MarketRouteCatalogReadV3 | undefined,
  report: MarketProviderAccountAccessReport | null,
  dirty: boolean,
) {
  const usableReport =
    report &&
    (report.configVersion === provider.configVersion || provider.configVersion === undefined)
      ? report
      : null;
  const pending: MarketAccountAccess = { state: 'unknown', attempted: false };
  const rows =
    usableReport?.routes ??
    catalog?.entries
      .filter((entry) => entry.target.providerId === provider.providerId)
      .map((entry) => ({
        key: entry.key,
        target: entry.target,
        access: !dirty && entry.accountAccess ? entry.accountAccess : pending,
      }));
  const expires = rows
    ?.map((row) => row.access.validUntil)
    .filter(Boolean)
    .sort()[0];
  const checkedAt =
    usableReport?.checkedAt ??
    rows
      ?.map((row) => row.access.checkedAt)
      .filter(Boolean)
      .sort()
      .at(-1);

  return { usableReport, rows, expires, checkedAt };
}

function accountAccessSummary(
  rows: ReturnType<typeof accountAccessEvidence>['rows'],
  configVersion: ProviderManifest['configVersion'],
) {
  const allowed =
    rows?.filter((row) => accountAccessState(row.access, Date.now(), configVersion) === 'allowed')
      .length ?? 0;
  const excluded = rows?.filter((row) => row.access.state === 'not_included').length ?? 0;
  const limited = rows?.some((row) =>
    ['rate_limited', 'rate_limited_global'].includes(row.access.errorCode ?? ''),
  );
  const incomplete = rows?.some((row) => row.access.state === 'unknown');

  return { allowed, excluded, limited, incomplete };
}
