import { createHash } from 'node:crypto';
import type { AiExecutionTrace } from './ai-execution-trace.js';
import { currentAiTrace } from './ai-trace-context.js';
import { AiTraceUnavailableError, type AiTraceNode } from './ai-trace-contract.js';
import { traceErrorSnapshot } from './ai-trace-error.js';
import { aiTraceHeaders, aiTraceUrl } from './ai-trace-redaction.js';
import { AiTraceResponseBody } from './ai-trace-response-body.js';

async function observeResponse(
  trace: AiExecutionTrace,
  requestId: string,
  response: Response,
  parentId: string,
) {
  let node: AiTraceNode;
  try {
    node = await trace.begin(
      'upstream.response',
      {
        status: response.status,
        statusText: response.statusText,
        headers: aiTraceHeaders(response.headers),
        url: response.url ? aiTraceUrl(response.url) : null,
      },
      parentId,
    );
  } catch {
    trace.issue('response_node_failed');
    return response;
  }
  const collector = new AiTraceResponseBody(response.headers.get('content-type') ?? '');
  const reader = response.body?.getReader();
  let finished: Promise<void> | undefined;
  const finish = (completion: 'eof' | 'cancelled' | 'read_error' | 'not_consumed') => {
    finished ??= (async () => {
      const capture = collector.finish();
      if (capture.raw.truncated) trace.issue('response_body_limit');
      if (capture.facts.invalidJson) trace.issue('unparsed_response_body');
      if (completion !== 'eof') trace.issue(`response_${completion}`);
      try {
        const content = await trace.artifact(node, 'assistant-content', capture.content, true);
        const body = await trace.artifact(node, 'response-body', capture.body);
        await trace.end(
          node,
          completion === 'eof' && response.ok && !capture.facts.upstreamErrors.length
            ? 'succeeded'
            : 'failed',
          {
            status: response.status,
            completion,
            rawBody: capture.raw,
            body,
            assistantContent: content,
            ...capture.facts,
          },
        );
      } catch {
        trace.issue('response_artifact_failed');
        await trace.end(node, 'failed', {
          status: response.status,
          completion,
          rawBody: capture.raw,
          ...capture.facts,
        });
      }
    })();
    trace.track(finished);
    return finished;
  };
  trace.registerResponse(requestId, async () => {
    if (!finished) {
      // SDK 已结束时终止未消费的原流，防止取证副本让上游请求继续运行。
      void reader?.cancel('sdk_completed').catch(() => undefined);
      await finish('not_consumed');
    } else await finished;
  });
  if (!reader) {
    await finish('eof');
    return response;
  }
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const part = await reader.read();
        if (part.done) {
          controller.close();
          void finish('eof');
          return;
        }
        collector.observe(part.value);
        controller.enqueue(part.value);
      } catch (error) {
        controller.error(error);
        void finish('read_error');
      }
    },
    cancel(reason) {
      void finish('cancelled');
      return reader.cancel(reason);
    },
  });
  const observed = new Response(body, response);
  Object.defineProperties(observed, {
    url: { value: response.url },
    redirected: { value: response.redirected },
  });
  return observed;
}

/** SDK 的唯一 fetch seam：手工派发一次，再把原状态、响应头和字节流交回 SDK。 */
export async function fetchWithAiTrace(
  input: Parameters<typeof fetch>[0],
  init: Parameters<typeof fetch>[1],
  client: typeof fetch,
): Promise<Response> {
  const scope = currentAiTrace();
  if (!scope?.sdkRequestId) return client(input, init);
  const { trace, sdkRequestId } = scope;
  const node = await trace.begin('http.request', {
    requestId: sdkRequestId,
    destination: aiTraceUrl(input),
    method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
    headers: aiTraceHeaders(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    ),
  });
  let dispatched = false;
  try {
    // 当前 SDK 使用序列化 JSON 字符串；不支持的 body 在派发前失败，避免先消费 Request 流。
    if (init?.body !== undefined && typeof init.body !== 'string')
      throw new AiTraceUnavailableError('unsupported_request_body');
    if (input instanceof Request && input.body && init?.body === undefined)
      throw new AiTraceUnavailableError('unsupported_request_body');
    const body = init?.body ?? '';
    let parsed: unknown = body;
    try {
      parsed = JSON.parse(body) as unknown;
    } catch {
      /* 非 JSON 请求保留脱敏字符串。 */
    }
    const artifact = await trace.artifact(node, 'request-body', parsed);
    trace.beforeDispatch(sdkRequestId);
    dispatched = true;
    const response = await client(input, init);
    await trace.end(node, 'succeeded', {
      dispatched: true,
      status: response.status,
      serializedBody: {
        bytes: Buffer.byteLength(body),
        sha256: createHash('sha256').update(body).digest('hex'),
        artifact,
      },
    });
    try {
      return await observeResponse(trace, sdkRequestId, response, node.id);
    } catch {
      trace.issue('response_observer_failed');
      return response;
    }
  } catch (error) {
    const failure =
      !dispatched && !(error instanceof AiTraceUnavailableError)
        ? new AiTraceUnavailableError('request_capture_failed')
        : error;
    if (!dispatched) trace.issue('request_capture_failed');
    await trace.end(node, 'failed', traceErrorSnapshot(failure));
    throw failure;
  }
}
