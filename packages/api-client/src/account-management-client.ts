import {
  accountInputSchema,
  accountResponseSchema,
  accountsResponseSchema,
} from '@thesis-ledger/schemas';
import type { AccountMode } from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from './api-error.js';

type Schema<T> = { safeParse(value: unknown): { success: true; data: T } | { success: false } };
type Request = <T>(path: string, schema: Schema<T>, init?: RequestInit) => Promise<T>;
type ResponseRequest = (path: string, init?: RequestInit) => Promise<Response>;
export type SaveAccountInput = {
  name: string;
  institution?: string;
  type: 'securities' | 'fund' | 'cash';
  mode: AccountMode;
  currency: 'CNY' | 'HKD' | 'USD';
};

export function accountManagementClient(request: Request, response: ResponseRequest) {
  const path = (id: string) => `/accounts/${encodeURIComponent(id)}`;
  return {
    list(params: { includeInactive?: boolean; mode?: AccountMode } = {}, signal?: AbortSignal) {
      const query = new URLSearchParams();
      if (params.includeInactive !== undefined)
        query.set('includeInactive', String(params.includeInactive));
      if (params.mode) query.set('mode', params.mode);
      const suffix = query.size ? `?${query}` : '';
      return request(
        `/accounts${suffix}`,
        accountsResponseSchema.refine(
          (rows) => !params.mode || rows.every((row) => row.mode === params.mode),
        ),
        { cache: 'no-store', ...(signal ? { signal } : {}) },
      );
    },
    save(input: SaveAccountInput, id?: string) {
      const body = accountInputSchema.parse(input);
      return request(
        id ? path(id) : '/accounts',
        accountResponseSchema.refine(
          (account) => account.mode === input.mode && (!id || account.id === id),
        ),
        {
          method: id ? 'PATCH' : 'POST',
          body: JSON.stringify(body),
        },
      );
    },
    async setActive(id: string, active: boolean) {
      await response(active ? `${path(id)}/reactivate` : path(id), {
        method: active ? 'POST' : 'DELETE',
      });
    },
    async permanentDelete(id: string) {
      const result = await response(`${path(id)}/permanent`, { method: 'DELETE' });
      if (result.status !== 204) throw new ThesisLedgerContractError(`${path(id)}/permanent`);
    },
  };
}
