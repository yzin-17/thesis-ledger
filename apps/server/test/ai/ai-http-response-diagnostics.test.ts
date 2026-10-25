import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { aiGenerationRuntimeDiagnosticSchema } from '@thesis-ledger/schemas';
import { AiGenerationHttpResponseDiagnostics } from '../../src/ai/ai-generation-http-response-diagnostics.js';
import { AiGenerationStreamDiagnostics } from '../../src/ai/ai-generation-stream-diagnostics.js';

const privateMessage = 'Provider returned error PRIVATE_PROMPT sk-response-secret';
const errorBody = () =>
  JSON.stringify({
    error: {
      code: 502,
      message: privateMessage,
      metadata: {
        raw: JSON.stringify({ error: { code: 503, message: 'Overloaded PRIVATE_UPSTREAM' } }),
        provider_name: 'PRIVATE_PROVIDER',
      },
    },
  });
const response = (wire: string, status = 200, mime = 'text/event-stream') =>
  new Response(wire, {
    status,
    statusText: 'local fixture',
    headers: { 'content-type': mime, 'x-private': 'PRIVATE_HEADER' },
  });

describe('实际 HTTP 响应的有界旁观', () => {
  it('保留 HTTP 状态与脱敏错误，完整响应字节及元信息透明传递', async () => {
    const d = new AiGenerationHttpResponseDiagnostics();
    expect(d.snapshot()).toBeUndefined();
    const wire = errorBody();
    const observed = d.observe(response(wire, 502, 'application/json; charset=utf-8'));
    expect(d.snapshot()).toMatchObject({ status: 502, bodyComplete: false, error: null });
    expect(observed.statusText).toBe('local fixture');
    expect(observed.headers.get('x-private')).toBe('PRIVATE_HEADER');
    expect(await observed.text()).toBe(wire);
    expect(d.snapshot()).toMatchObject({
      status: 502,
      contentType: 'json',
      bodyComplete: true,
      bodyJson: 'valid',
      bodyBytes: Buffer.byteLength(wire),
      sse: null,
      error: {
        origin: 'http_body',
        code: 502,
        category: 'provider_error',
        messageCharacters: privateMessage.length,
        messageSha256: createHash('sha256').update(privateMessage).digest('hex'),
        upstream: { code: 503, category: 'overloaded' },
      },
    });
    const saved = JSON.stringify(d.snapshot());
    expect(saved).not.toMatch(/PRIVATE|sk-response-secret|provider_name|headers|metadata/u);
    expect(Buffer.byteLength(saved)).toBeLessThanOrEqual(2048);
  });

  it('HTTP200 的原始 SSE 错误与 SDK 帧分别记录，CRLF 和 UTF-8 跨片不损坏', async () => {
    const d = new AiGenerationStreamDiagnostics('openai-compatible-chat', 'stream');
    const wire = `: 心跳\r\nevent: error\r\ndata: ${errorBody()}\r\n\r\ndata: [DONE]\r\n\r\n`;
    const bytes = Buffer.from(wire);
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
        controller.close();
      },
    });
    const observed = d.observeHttpResponse(
      new Response(source, { headers: { 'content-type': 'text/event-stream' } }),
    );
    expect(Buffer.from(await observed.arrayBuffer())).toEqual(bytes);
    const runtime = d.snapshot();
    expect(runtime).toMatchObject({
      httpResponse: {
        status: 200,
        bodyBytes: bytes.length,
        bodyComplete: true,
        sse: { events: 2, invalidJsonEvents: 0, done: true, incompleteEvent: false },
        error: { origin: 'sse_error', code: 502, upstream: { category: 'overloaded' } },
      },
      stream: { provider: { frames: 0 }, sdk: { text: { chunks: 0 } } },
    });
    expect(aiGenerationRuntimeDiagnosticSchema.parse(JSON.parse(JSON.stringify(runtime)))).toEqual(
      runtime,
    );
    expect(Buffer.byteLength(JSON.stringify(runtime))).toBeLessThanOrEqual(8192);
  });

  it('无效 JSON、过长帧和未结束帧明确标记，后续有界错误仍能观察', async () => {
    const d = new AiGenerationHttpResponseDiagnostics();
    const wire =
      `: ${'x'.repeat(9000)}\n\n` +
      `data: PRIVATE_INVALID\n\ndata: ${'x'.repeat(9000)}\n\n` +
      `data: ${errorBody()}\n\ndata: {`;
    expect(await d.observe(response(wire)).text()).toBe(wire);
    expect(d.snapshot()).toMatchObject({
      bodyTruncated: true,
      bodyComplete: true,
      sse: { events: 3, invalidJsonEvents: 1, oversizeEvents: 1, incompleteEvent: true },
      error: { code: 502 },
    });
    expect(JSON.stringify(d.snapshot())).not.toMatch(/PRIVATE|xxxx/u);
  });

  it('非 SSE 超大响应不作不完整 JSON 推断，后续响应仅计数', async () => {
    const d = new AiGenerationHttpResponseDiagnostics();
    const wire = 'PRIVATE'.repeat(2000);
    expect(await d.observe(response(wire, 503, 'text/html')).text()).toBe(wire);
    const second = response('second', 200);
    expect(d.observe(second)).toBe(second);
    expect(d.snapshot()).toMatchObject({
      responses: 2,
      omittedResponses: 1,
      status: 503,
      contentType: 'html',
      bodyBytes: Buffer.byteLength(wire),
      bodyComplete: true,
      bodyTruncated: true,
      bodyJson: 'oversize',
      error: null,
    });
  });

  it('读取失败原样传播，不将未完成响应标为完整', async () => {
    const d = new AiGenerationHttpResponseDiagnostics();
    const failure = new Error('local source failure');
    let pulls = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (pulls++ === 0) controller.enqueue(Buffer.from('data: {'));
        else controller.error(failure);
      },
    });
    const observed = d.observe(new Response(source));
    await expect(observed.arrayBuffer()).rejects.toBe(failure);
    expect(d.snapshot()).toMatchObject({ bodyComplete: false, error: null });
  });

  it('取消向原始流传播，不额外读取或重试', async () => {
    const d = new AiGenerationHttpResponseDiagnostics();
    let cancelled: unknown;
    const source = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(Buffer.from('data: {'));
      },
      cancel(reason: unknown) {
        cancelled = reason;
      },
    });
    const observed = d.observe(new Response(source));
    if (!observed.body) throw new Error('本地样本应包含响应流');
    const reader = observed.body.getReader();
    await reader.read();
    await reader.cancel('local cancellation');
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(cancelled).toBe('local cancellation');
    expect(d.snapshot()).toMatchObject({ bodyComplete: false });
  });
});
