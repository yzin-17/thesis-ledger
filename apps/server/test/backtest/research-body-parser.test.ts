import { afterEach, describe, expect, it } from 'vitest';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import { backtestResearchBodyParserOptions } from '../../src/backtest/backtest-research-body-parser.js';
import { ApiExceptionFilter } from '../../src/platform/api-exception.filter.js';

let server: Server | undefined;
afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
});

describe('冻结原文的有界HTTP入口', () => {
  it('真实HTTP接受超过100KiB冻结输入；其他入口保持默认限制，超预算及坏JSON明确拒绝', async () => {
    const adapter = new ExpressAdapter();
    adapter.useBodyParser('json', false, backtestResearchBodyParserOptions());
    adapter.useBodyParser('json', false, { limit: '100kb' });
    const app = adapter.getInstance();
    app.post('/api/v1/backtests/run-config/preflight', (request: Request, response: Response) =>
      response.json({ length: request.body.raw.length }),
    );
    app.post('/other', (_request: Request, response: Response) =>
      response.json({ accepted: true }),
    );
    app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
      void next;
      new ApiExceptionFilter().catch(error, {
        switchToHttp: () => ({ getResponse: () => response }),
      } as never);
    });
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server!.on('listening', resolve));
    const address = server!.address();
    if (!address || typeof address === 'string') throw new Error('缺少HTTP端口');
    const base = `http://127.0.0.1:${address.port}`;
    const post = (path: string, body: string) =>
      fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body });
    const body = JSON.stringify({ raw: 'x'.repeat(130000) });
    const success = await post('/api/v1/backtests/run-config/preflight', body);
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({ length: 130000 });
    expect((await post('/other', body)).status).toBe(413);
    const oversized = await post(
      '/api/v1/backtests/run-config/preflight',
      JSON.stringify({ raw: 'x'.repeat(8 * 1024 * 1024) }),
    );
    expect(oversized.status).toBe(413);
    expect(await oversized.json()).toMatchObject({ error: 'request_body_too_large' });
    expect((await post('/api/v1/backtests/run-config/preflight', '{')).status).toBe(400);
  });
});
