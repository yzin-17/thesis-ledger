import { createRequire } from 'node:module';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const { pipeUpstreamResponse } = require('../electron/api-proxy.cjs') as {
  pipeUpstreamResponse: (
    upstream: Response,
    response: PassThrough & { writeHead: (status: number, headers: object) => void },
    onDisconnect: () => void,
  ) => void;
};

describe('Electron API 流式代理', () => {
  it('首个 SSE 分片可在上游结束前到达客户端', async () => {
    let enqueue!: (chunk: Uint8Array) => void;
    let close!: () => void;
    const upstream = new Response(
      new ReadableStream({
        start(controller) {
          enqueue = (chunk) => controller.enqueue(chunk);
          close = () => controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
    const downstream = new PassThrough() as PassThrough & {
      writeHead: (status: number, headers: object) => void;
    };
    downstream.writeHead = vi.fn();
    const chunks: Buffer[] = [];
    downstream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));

    pipeUpstreamResponse(upstream, downstream, vi.fn());
    enqueue(new TextEncoder().encode('event: heartbeat\n\n'));
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(Buffer.concat(chunks).toString()).toBe('event: heartbeat\n\n');
    expect(downstream.writableEnded).toBe(false);
    close();
  });
});
