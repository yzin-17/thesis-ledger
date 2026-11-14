import { routingScopeId } from '@thesis-ledger/schemas';
import { cn } from '@/lib/utils';
import {
  RoutingScopeSourceRow,
  routingSourceColumns,
  type RoutingScopeSourceProps,
} from './RoutingScopeSourceRow.js';
import type { RoutingScopeNode } from './routing-scope-tree.js';

export function RoutingSourceHeader() {
  return (
    <div
      className={cn(
        routingSourceColumns,
        'hidden bg-muted/30 px-2 py-2 text-xs text-muted-foreground sm:grid',
      )}
    >
      <span>配置范围</span>
      <div className="grid grid-cols-2 gap-3">
        <span>主数据源</span>
        <span>备用数据源</span>
      </div>
    </div>
  );
}

export function RoutingScopeList({
  rows,
  ...props
}: RoutingScopeSourceProps & { rows: RoutingScopeNode[] }) {
  return (
    <div className="min-w-0" aria-label="配置列表">
      <RoutingSourceHeader />
      {rows.map((node) => (
        <RoutingScopeSourceRow {...props} {...node} key={routingScopeId(node.scope)} />
      ))}
      {!rows.length && (
        <p role="status" className="py-8 text-center text-sm text-muted-foreground">
          没有符合筛选条件的配置
        </p>
      )}
    </div>
  );
}
