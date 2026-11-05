import {
  riskApplicationArchiveSchema,
  riskApplicationCreateSchema,
  riskApplicationPreviewInputSchema,
  riskApplicationUpdateSchema,
  riskApplicationUpgradeSchema,
  strategyManagementIdSchema,
  strategyRiskApplicationListSchema,
  strategyRiskApplicationReadSchema,
  strategyRiskListInputSchema,
  strategyRiskPreviewReadSchema,
  strategyRiskUpgradeInputSchema,
  strategyRiskUpgradePreviewReadSchema,
  type StrategyRiskCreateInput,
  type StrategyRiskNotificationInput,
} from '@thesis-ledger/schemas';
import type { ParsedRequest, ParsedResponseSchema } from './parsed-request.js';

const prefix = '/strategy-optimization/risk-applications';
const path = (id: string) =>
  `${prefix}/${encodeURIComponent(strategyManagementIdSchema.parse(id))}`;
export function strategyRiskClient(request: ParsedRequest) {
  const write = <T>(url: string, body: unknown, schema: ParsedResponseSchema<T>, method = 'POST') =>
    request(url, schema, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  const owned = (id: string) => strategyRiskApplicationReadSchema.refine((v) => v.id === id);
  return {
    list: (
      options: { accountId?: string; symbol?: string; includeArchived?: boolean } = {},
      signal?: AbortSignal,
    ) => {
      strategyRiskListInputSchema.parse(options);
      const q = new URLSearchParams({ includeArchived: String(options.includeArchived ?? false) });
      if (options.accountId) q.set('accountId', options.accountId);
      if (options.symbol) q.set('symbol', options.symbol);
      return request(
        `${prefix}?${q.toString()}`,
        strategyRiskApplicationListSchema.refine((items) =>
          items.every(
            (v) =>
              (!options.accountId || v.accountId === options.accountId) &&
              (!options.symbol || v.symbol === options.symbol),
          ),
        ),
        { cache: 'no-store', signal: signal ?? null },
      );
    },
    read: (id: string, signal?: AbortSignal) =>
      request(path(id), owned(id), { cache: 'no-store', signal: signal ?? null }),
    preview: (input: {
      strategyVersionId: string;
      accountId: string;
      symbol: string;
      cycleMode: 'existingAndFuture' | 'nextPositionCycle';
    }) => {
      const body = riskApplicationPreviewInputSchema.parse(input);
      return write(
        `${prefix}/preview`,
        body,
        strategyRiskPreviewReadSchema.refine(
          (v) =>
            v.cycleMode === body.cycleMode &&
            (!v.plan.strategyVersionId || v.plan.strategyVersionId === body.strategyVersionId),
        ),
      );
    },
    create: (input: StrategyRiskCreateInput) => {
      const body = riskApplicationCreateSchema.parse(input);
      return write(
        prefix,
        body,
        strategyRiskApplicationReadSchema.refine(
          (v) =>
            v.accountId === body.accountId &&
            v.symbol === body.symbol &&
            v.strategyVersionId === body.strategyVersionId &&
            v.cycleMode === body.cycleMode,
        ),
      );
    },
    update: (
      id: string,
      input: {
        expectedRevision: number;
        enabled?: boolean;
        notification?: StrategyRiskNotificationInput;
      },
    ) => write(path(id), riskApplicationUpdateSchema.parse(input), owned(id), 'PATCH'),
    archive: (id: string, expectedRevision: number) =>
      write(
        path(id),
        riskApplicationArchiveSchema.parse({ expectedRevision }),
        owned(id),
        'DELETE',
      ),
    previewUpgrade: (id: string, targetStrategyVersionId: string) =>
      write(
        `${path(id)}/upgrade-preview`,
        strategyRiskUpgradeInputSchema.parse({ targetStrategyVersionId }),
        strategyRiskUpgradePreviewReadSchema,
      ),
    upgrade: (
      id: string,
      input: {
        expectedRevision: number;
        targetStrategyVersionId: string;
        previewHash: string;
        idempotencyKey: string;
      },
    ) => {
      const body = riskApplicationUpgradeSchema.parse(input);
      return write(
        `${path(id)}/upgrade`,
        body,
        strategyRiskApplicationReadSchema.refine(
          (v) => v.strategyVersionId === body.targetStrategyVersionId,
        ),
      );
    },
  };
}
