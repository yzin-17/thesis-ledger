import { Injectable } from '@nestjs/common';
import {
  backtestNavSourceRequestV3Schema,
  type BacktestNavSourceRequestV3,
} from '@thesis-ledger/schemas';
import { loadConfig } from '../../platform/config.js';
import { currentTraceId } from '../../platform/structured-logger.js';
import { DsaV3ProtocolError } from './dsa-v3-protocol.js';
import { parseNavResponseV3, mapNavHttpError } from './dsa-nav-v3.js';
import { navInvalid, parseNavRaw } from './dsa-nav-raw.js';

/** 整个 HTTP 响应包含嵌套原文；单次精确请求，大小和总时间均有界。 */
@Injectable()
export class DsaNavClient {
  private readonly config = loadConfig();

  async read(input: BacktestNavSourceRequestV3) {
    const request = backtestNavSourceRequestV3Schema.parse(input);
    const deadline = performance.now() + this.config.dsaTimeoutMs;
    const signal = AbortSignal.timeout(this.config.dsaTimeoutMs);
    try {
      const response = await fetch(
        new URL('/api/v3/thesis-ledger/backtest/nav-inputs', this.config.dsaBaseUrl),
        {
          method: 'POST',
          redirect: 'error',
          signal,
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${this.config.dsaToken}`,
            'x-request-id': request.requestId,
            'x-trace-id': currentTraceId() ?? request.requestId,
          },
          body: JSON.stringify(request),
        },
      );
      if ([401, 403, 404, 405].includes(response.status)) {
        await response.body?.cancel();
        throw mapNavHttpError(response.status, null, request.requestId);
      }
      const raw = await readNavHttpBody(response, signal);
      if (signal.aborted || performance.now() > deadline)
        throw new DsaV3ProtocolError('DSA 净值请求超时', 'timeout');
      const body = parseNavRaw(raw);
      if (!response.ok) throw mapNavHttpError(response.status, body, request.requestId);
      if (response.status !== 200) navInvalid();
      const result = parseNavResponseV3(body, request);
      if (signal.aborted || performance.now() > deadline)
        throw new DsaV3ProtocolError('DSA 净值请求超时', 'timeout');
      return result;
    } catch (error) {
      if (error instanceof DsaV3ProtocolError) throw error;
      if (signal.aborted || (error instanceof DOMException && error.name === 'TimeoutError')) {
        throw new DsaV3ProtocolError('DSA 净值请求超时', 'timeout');
      }
      throw new DsaV3ProtocolError('DSA 净值接口不可用', 'unavailable');
    }
  }
}

export async function readNavHttpBody(
  response: Response,
  signal: AbortSignal,
  maxBytes = 128 * 1024 * 1024,
) {
  const length = response.headers.get('content-length');
  if ((length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) || !response.body) {
    await response.body?.cancel();
    navInvalid();
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const parts: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DsaV3ProtocolError('DSA 净值请求超时', 'timeout');
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) navInvalid();
      parts.push(decoder.decode(chunk.value, { stream: true }));
    }
    parts.push(decoder.decode());
    return parts.join('');
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    if (error instanceof TypeError) navInvalid();
    throw error;
  } finally {
    reader.releaseLock();
  }
}
