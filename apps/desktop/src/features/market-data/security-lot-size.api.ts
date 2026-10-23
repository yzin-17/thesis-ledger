import { securityLotSizeResponseSchema, securityLotSymbolSchema } from '@thesis-ledger/schemas';
import { ThesisLedgerContractError } from '@thesis-ledger/api-client';
import { getDesktopApiClient } from '../../shared/api/client.js';

export async function fetchSecurityLotSize(symbol: string, signal?: AbortSignal) {
  const canonical = securityLotSymbolSchema.parse(symbol);
  const raw = await getDesktopApiClient().request<unknown>(
    `/api/market-data/security-lot-size?symbol=${encodeURIComponent(canonical)}`,
    signal ? { signal } : {},
  );
  const parsed = securityLotSizeResponseSchema.safeParse(raw);
  if (!parsed.success || parsed.data.symbol !== canonical)
    throw new ThesisLedgerContractError('/api/market-data/security-lot-size');
  return parsed.data;
}
