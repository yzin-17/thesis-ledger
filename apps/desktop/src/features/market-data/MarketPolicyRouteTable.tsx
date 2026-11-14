import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { MarketPolicyTargetSelect } from './MarketPolicyTargetSelect.js';
import { marketPolicyDisplayGroupsV3 } from './market-policy-route-groups-v3.js';
import {
  marketCapabilityLabel,
  policyRouteTargetsV3,
  readyRouteTargetsV3,
  routeAvailabilityMessageV3,
  updatePolicyRouteTargetV3,
  type MarketPolicyRouteRowV3,
} from './market-data-routes-v3.js';
import { effectiveRouteLabelV3 } from './market-policy-status-v3.js';
import type {
  MarketPolicyDraftV3,
  MarketPolicyResponse,
  MarketRouteCatalogReadV3,
  ProviderManifest,
} from './market-data.types.js';

export type MarketPolicyRouteTableProps = {
  rows: readonly MarketPolicyRouteRowV3[];
  policy: MarketPolicyDraftV3;
  serverPolicy: MarketPolicyResponse | null;
  catalog: MarketRouteCatalogReadV3 | undefined;
  providers: ProviderManifest[];
  disabled: boolean;
  changedIds: ReadonlySet<string>;
  onChange: (policy: MarketPolicyDraftV3) => void;
};

function RouteRow({
  row,
  policy,
  serverPolicy,
  catalog,
  providers,
  disabled,
  changedIds,
  onChange,
}: Omit<MarketPolicyRouteTableProps, 'rows'> & {
  row: MarketPolicyRouteRowV3;
}) {
  const [primary, fallback] = policyRouteTargetsV3(policy, row.key);
  const changed = changedIds.has(row.id);
  const status = effectiveRouteLabelV3(serverPolicy, row, false);
  const noCandidates = readyRouteTargetsV3(catalog, row.key, providers).length === 0;
  return (
    <TableRow>
      <TableCell className="w-56 min-w-48 whitespace-normal">
        <strong className="text-sm font-medium">{row.label}</strong>
        {noCandidates && (
          <p className="mt-1 text-xs text-muted-foreground">
            {routeAvailabilityMessageV3(catalog, row.key)}
          </p>
        )}
      </TableCell>
      {(['primary', 'fallback'] as const).map((role) => (
        <TableCell key={role} className="w-64 min-w-48 max-w-72">
          <MarketPolicyTargetSelect
            row={row}
            role={role}
            selected={role === 'primary' ? primary : fallback}
            other={role === 'primary' ? fallback : primary}
            catalog={catalog}
            providers={providers}
            disabled={disabled}
            compact
            onChange={(target) =>
              onChange(updatePolicyRouteTargetV3(policy, row.key, role, target))
            }
          />
        </TableCell>
      ))}
      <TableCell className="min-w-32 max-w-48 whitespace-normal">
        {changed && <p className="text-sm">{primary ? '待保存' : '待清空来源'}</p>}
        <p className="text-xs text-muted-foreground">{status}</p>
      </TableCell>
    </TableRow>
  );
}

export function MarketPolicyRouteTable(props: MarketPolicyRouteTableProps) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  return (
    <Table className="min-w-[740px]" aria-label="数据能力来源配置">
      <TableHeader>
        <TableRow>
          <TableHead>数据能力</TableHead>
          <TableHead>主数据源</TableHead>
          <TableHead>备用数据源</TableHead>
          <TableHead>状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {marketPolicyDisplayGroupsV3(props.rows).map((group) => {
          if (group.rows.length === 1)
            return <RouteRow key={group.id} {...props} row={group.rows[0]!} />;
          const open = expanded.has(group.id);
          const changes = group.rows.filter((row) => props.changedIds.has(row.id)).length;
          const configured = group.rows.filter(
            (row) => policyRouteTargetsV3(props.policy, row.key).length > 0,
          ).length;
          const issues = group.rows.filter((row) => {
            const state = effectiveRouteLabelV3(props.serverPolicy, row, false);
            return state !== null && !['已生效', '未配置', '尚未配置'].includes(state);
          }).length;
          const first = group.rows[0]!;
          return (
            <Fragment key={group.id}>
              <TableRow>
                <TableCell colSpan={4} className="whitespace-normal">
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={open}
                    aria-label={`${open ? '收起' : '展开'}${marketCapabilityLabel(first.key.capability)}配置`}
                    onClick={() =>
                      setExpanded((current) => {
                        const next = new Set(current);
                        if (open) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      })
                    }
                  >
                    {open ? (
                      <ChevronDown data-icon="inline-start" />
                    ) : (
                      <ChevronRight data-icon="inline-start" />
                    )}
                    {first.label.split(' · ')[0]} · {marketCapabilityLabel(first.key.capability)}
                  </Button>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {group.rows.length} 项口径，已配置 {configured} 项
                    {changes > 0 && `，已修改 ${changes} 项`}
                    {issues > 0 && `，需检查 ${issues} 项`}
                  </span>
                </TableCell>
              </TableRow>
              {open && group.rows.map((row) => <RouteRow key={row.id} {...props} row={row} />)}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
}
