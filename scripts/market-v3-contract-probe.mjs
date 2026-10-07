import { randomUUID } from 'node:crypto';
import {
  marketControlHandshakeResponseV3Schema,
  marketDataContractCapabilitiesV3Schema,
  marketRouteCatalogV3Schema,
  marketRouteCatalogGetEndpointV3,
  marketDataErrorEnvelopeV3Schema,
} from '../packages/schemas/dist/index.js';

/** 仅验证协议与鉴权边界，不取行情、不应用策略、不创建目录或业务任务。 */
export async function probeMarketV3Contract({ origin, controlToken, dataToken, fetchImpl = fetch }) {
  let target;
  try {
    target = new URL(origin);
  } catch {
    throw new Error('V3 契约检查需要有效的 DSA origin');
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== '/' ||
    target.search ||
    target.hash
  )
    throw new Error('DSA origin 必须只包含 HTTP(S) 协议、主机与端口');
  if (!controlToken?.trim()) throw new Error('V3 契约检查缺少 Control Token');
  if (!dataToken?.trim()) throw new Error('V3 契约检查缺少 Data Token');
  const requestId = randomUUID();
  const handshakePath = '/api/v3/thesis-ledger/control/handshake';
  const handshake = {
    contractVersion: 3,
    consumer: 'thesis-ledger',
    requestId,
    supportedVersions: [3],
  };
  const call = async (path, init = {}, rejected = false, expectedStatus = 200) => {
    let response;
    try {
      response = await fetchImpl(new URL(path, target), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      throw new Error(`V3 契约端点请求失败：${path}`);
    }
    if (rejected) {
      if (![401, 403].includes(response.status))
        throw new Error(`V3 契约端点未拒绝无效凭据：${path}`);
      await response.body?.cancel();
      return null;
    }
    if (response.status !== expectedStatus) {
      await response.body?.cancel();
      throw new Error(`V3 契约端点状态异常：${path} (${response.status})`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`V3 契约端点未返回 JSON：${path}`);
    }
  };
  const jsonHeaders = { accept: 'application/json', 'content-type': 'application/json' };
  const invalidHeaders = { ...jsonHeaders, authorization: `Bearer invalid-${randomUUID()}` };
  await call(
    handshakePath,
    { method: 'POST', headers: invalidHeaders, body: JSON.stringify(handshake) },
    true,
  );
  await call(marketRouteCatalogGetEndpointV3, { headers: invalidHeaders }, true);
  await call(
    '/api/v3/thesis-ledger/market/bars',
    { method: 'POST', headers: invalidHeaders, body: '{}' },
    true,
  );
  const capabilities = marketDataContractCapabilitiesV3Schema.safeParse(
    await call('/api/v3/thesis-ledger/capabilities'),
  );
  if (!capabilities.success || !capabilities.data.dataContractVersions.includes(3))
    throw new Error('DSA 未声明有效的 Data Contract V3');
  // 无效协议在请求解析阶段拒绝；验证有效 Data Token，绝不进入行情运行时。
  const dataAuth = marketDataErrorEnvelopeV3Schema.safeParse(
    await call('/api/v3/thesis-ledger/market/bars', {
      method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${dataToken.trim()}` },
      body: JSON.stringify({ contractVersion: 0, requestId }),
    }, false, 422),
  );
  if (!dataAuth.success || dataAuth.data.requestId !== requestId ||
      dataAuth.data.error.code !== 'unsupported_data_contract_version')
    throw new Error('Data Token 或无行情请求校验边界无效');
  const headers = { ...jsonHeaders, authorization: `Bearer ${controlToken.trim()}` };
  await call(
    '/api/v1/thesis-ledger/control/handshake',
    { method: 'POST', headers, body: JSON.stringify(handshake) },
    false,
    404,
  );
  const negotiated = marketControlHandshakeResponseV3Schema.safeParse(
    await call(handshakePath, { method: 'POST', headers, body: JSON.stringify(handshake) }),
  );
  if (!negotiated.success || negotiated.data.requestId !== requestId)
    throw new Error('Control Contract V3 握手无效或请求身份不匹配');
  const catalog = marketRouteCatalogV3Schema.safeParse(
    await call(marketRouteCatalogGetEndpointV3, { headers }),
  );
  if (!catalog.success || catalog.data.integrity !== 'complete')
    throw new Error('V3 精确路由目录无效或不完整');
  return {
    status: 'passed',
    scope: 'market-v3-protocol-only',
    dataContractVersion: 3,
    controlContractVersion: 3,
    dataAuthentication: 'verified-without-market-read',
    catalogRevision: catalog.data.catalogRevision,
  };
}
