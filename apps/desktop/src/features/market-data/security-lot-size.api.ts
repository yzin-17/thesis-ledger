import { marketInformationClient } from '@thesis-ledger/api-client';
import { parsedDesktopRequest } from '../shared/request.js';
export const fetchSecurityLotSize = async (symbol: string, signal?: AbortSignal) =>
  marketInformationClient(parsedDesktopRequest()).getSecurityLotSize(symbol, signal);
