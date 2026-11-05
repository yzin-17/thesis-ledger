import {
  correlateReportMetadata, reportMetadataCurrentRevisions, reportMetadataEndpoint, reportMetadataRequestSchema,
  type ReportMetadataRequest,
} from '@thesis-ledger/schemas';
import { DsaError, type DsaClient } from './dsa.client.js';
import { mapDataV3HttpError } from './dsa-v3-protocol.js';

/** 单次元数据请求；沿用统一认证与传输，不重试或切换数据来源。 */
export async function readReportMetadata(dsa: Pick<DsaClient, 'post'>, input: ReportMetadataRequest) {
  const request = reportMetadataRequestSchema.parse(input);
  const raw = await dsa.post<unknown>(reportMetadataEndpoint, request, 1,
    (status, payload) => mapDataV3HttpError(status, payload, request.requestId), request.requestBudgetMs);
  try {
    const page = correlateReportMetadata(request, raw);
    if (page.metadataVersion !== reportMetadataCurrentRevisions.metadataVersion
      || page.adapterRevision !== reportMetadataCurrentRevisions.adapterRevision
      || page.sourceRevision !== reportMetadataCurrentRevisions.sourceRevision)
      throw new Error('研报响应修订不符');
    return page;
  }
  catch { throw new DsaError('研报元数据响应未匹配当前请求', 'invalid-response'); }
}
