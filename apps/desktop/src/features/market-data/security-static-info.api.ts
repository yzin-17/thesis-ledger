import { marketInformationClient, ThesisLedgerContractError } from '@thesis-ledger/api-client';
import type { SecurityStaticAssetType } from '@thesis-ledger/schemas';
import { parsedDesktopRequest } from '../shared/request.js';
export async function fetchSecurityStaticInfo(
  symbol: string,
  assetType: SecurityStaticAssetType,
  signal?: AbortSignal,
) {
  try {
    return await marketInformationClient(parsedDesktopRequest()).getSecurityStaticInfo(
      symbol,
      assetType,
      signal,
    );
  } catch (error) {
    if (error instanceof ThesisLedgerContractError) throw new Error('证券资料响应与当前查询不匹配');
    throw error;
  }
}
export async function fetchSecurityStaticQuote(
  symbol: string,
  assetType: SecurityStaticAssetType,
  signal?: AbortSignal,
) {
  try {
    return await marketInformationClient(parsedDesktopRequest()).getSecurityQuote(
      symbol,
      assetType,
      signal,
    );
  } catch (error) {
    if (error instanceof ThesisLedgerContractError) throw new Error('报价响应与当前证券不匹配');
    throw error;
  }
}
