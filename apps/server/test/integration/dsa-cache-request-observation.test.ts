import { afterEach, expect, it, vi } from 'vitest';
import { DsaClient } from '../../src/integration/dsa/dsa.client.js';
import { StructuredLogger, runWithTrace } from '../../src/platform/structured-logger.js';

vi.mock('../../src/platform/config.js', () => ({ loadConfig: () => ({
  dsaBaseUrl: 'http://fixture.dsa.invalid', dsaToken: 'synthetic-secret', dsaTimeoutMs: 500,
}) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('原GET参数及响应保持，日志只带pathname/trace和一组唯一传输ID', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{"value":1}'));
  vi.stubGlobal('fetch', fetcher);
  const result = await runWithTrace('fixture-trace', () => new DsaClient().get(
    '/api/v3/thesis-ledger/market/fund-nav?symbol=000001.OF&token=private-query'));
  expect(result).toEqual({ value: 1 });
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[0].toString()).toContain('token=private-query');
  expect(log.mock.calls.map(([record]) => record.stage)).toEqual(['started', 'settled']);
  expect(log.mock.calls[0]?.[0]).toMatchObject({ traceId: 'fixture-trace', category: 'data',
    path: '/api/v3/thesis-ledger/market/fund-nav', method: 'GET', attempt: 1 });
  expect(log.mock.calls[1]?.[0].transportId).toBe(log.mock.calls[0]?.[0].transportId);
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-query|synthetic-secret|000001/);
});

it('原GET失败仍恰两次尝试，每次ID独立，不吞掉原安全错误', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{"detail":{"message":"原不可用"}}', { status: 503 }));
  vi.stubGlobal('fetch', fetcher);
  await expect(runWithTrace('retry-trace', () => new DsaClient().get('/api/v3/thesis-ledger/market/chip?symbol=600519.SH')))
    .rejects.toMatchObject({ code: 'unavailable', status: 503, message: '原不可用' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(log.mock.calls.map(([record]) => record.attempt)).toEqual([1, 1, 2, 2]);
  expect(new Set(log.mock.calls.map(([record]) => record.transportId)).size).toBe(2);
});

it('控制POST仍保留请求体/认证且与数据类别隔离', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  const body = { symbol: '000001.OF', credential: 'private-body' };
  await runWithTrace('control-trace', () => new DsaClient().post('/api/v3/thesis-ledger/market/cache-context', body, 1));
  expect(fetcher).toHaveBeenCalledOnce();
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify(body),
    headers: { authorization: 'Bearer synthetic-secret' } });
  expect(log.mock.calls[0]?.[0]).toMatchObject({ category: 'control', method: 'POST', attempt: 1 });
  expect(JSON.stringify(log.mock.calls)).not.toMatch(/private-body|synthetic-secret|000001/);
});

it('观察输出失败不增加重试、不改变响应', async () => {
  vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => { throw new Error('观察失败'); });
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await expect(runWithTrace('logger-failure', () => new DsaClient().get('/api/v3/thesis-ledger/market/fund-holdings'))).resolves.toEqual({});
  expect(fetcher).toHaveBeenCalledOnce();
});

it('非缓存请求保持原传输且不输出本观察记录', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await new DsaClient().get('/api/control/providers');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(log).not.toHaveBeenCalled();
});

it('网络超时每次均有结束记录，原尝试数与timeout分类保持', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => { throw new DOMException('synthetic', 'TimeoutError'); });
  vi.stubGlobal('fetch', fetcher);
  await expect(runWithTrace('timeout-trace', () => new DsaClient().get('/api/v3/thesis-ledger/market/fund-nav/history')))
    .rejects.toMatchObject({ code: 'timeout' });
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(log.mock.calls.filter(([record]) => record.stage === 'settled').map(([record]) => record.outcome))
    .toEqual(['error', 'error']);
});

it('无原消费trace的独立CLI保持原stdout协议，不被观察日志污染', async () => {
  const log = vi.spyOn(StructuredLogger.prototype, 'log').mockImplementation(() => {});
  const fetcher = vi.fn<typeof fetch>(async () => new Response('{}'));
  vi.stubGlobal('fetch', fetcher);
  await new DsaClient().get('/api/v3/thesis-ledger/market/fund-nav');
  expect(fetcher).toHaveBeenCalledOnce();
  expect(log).not.toHaveBeenCalled();
});
