import {
  marketEventAdmissionCatalogV3Schema,
  marketRouteCatalogGetEndpointV3,
} from '@thesis-ledger/schemas';
import type { DsaClient } from './dsa.client.js';
import { DsaV3ProtocolError, mapControlV3HttpError } from './dsa-v3-protocol.js';

/** 原Control只读端口；严格版本/模型，旧目标缺视图时不降为ready证明。 */
export async function readDsaEventAdmissionCatalogV3(client: Pick<DsaClient, 'control'>) {
  const raw = await client.control<unknown>(`${marketRouteCatalogGetEndpointV3}&eventAdmissions=v1`,
    undefined, 1, (status, payload) => mapControlV3HttpError(status, payload));
  const parsed = marketEventAdmissionCatalogV3Schema.safeParse(raw);
  if (!parsed.success) throw new DsaV3ProtocolError('事件精确准入只读视图无效或未部署', 'invalid-response');
  return parsed.data;
}
