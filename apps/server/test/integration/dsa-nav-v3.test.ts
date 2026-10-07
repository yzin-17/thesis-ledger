import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseNavResponseV3 } from '../../src/integration/dsa/dsa-nav-v3.js';
import { DsaNavClient, readNavHttpBody } from '../../src/integration/dsa/dsa-nav-client.js';
import { navCanonical, navHash, parseNavRaw } from '../../src/integration/dsa/dsa-nav-raw.js';
import { navSourceFixture } from './dsa-nav.fixtures.js';
import { NestFactory } from '@nestjs/core';
import { DsaModule } from '../../src/integration/dsa/dsa.module.js';

const client = () =>
  Object.assign(Object.create(DsaNavClient.prototype), {
    config: { dsaBaseUrl: 'https://dsa.example.test', dsaTimeoutMs: 5000, dsaToken: 'test-token' },
  }) as DsaNavClient;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('精确净值客户端与原文关联', () => {
  it('DSA 模块实际注册并导出独立净值客户端', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://fixture:fixture@localhost/fixture');
    vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
    vi.stubEnv('DSA_BASE_URL', 'https://dsa.example.test');
    vi.stubEnv('THESIS_LEDGER_DSA_TOKEN', 'test-token');
    const module = await NestFactory.createApplicationContext(DsaModule, {
      logger: false,
      abortOnError: false,
    });
    expect(module.get(DsaNavClient)).toBeInstanceOf(DsaNavClient);
    await module.close();
  });
  it('完整信封保留十进制与原文', () => {
    const { request, response } = navSourceFixture();
    expect(parseNavResponseV3(response, request).facts[0]?.nav).toBe('1.2300');
  });
  it.each(['requestId', 'catalogRevision', 'routeTarget', 'calendarDecisionRaw', 'dataAsOf'])(
    '拒绝固定请求的 %s 错配',
    (field) => {
      const { request, response } = navSourceFixture();
      const changed = { ...response, [field]: null };
      expect(() => parseNavResponseV3(changed, request)).toThrow();
    },
  );
  it.each([
    'pageHash',
    'pageState',
    'batchHash',
    'native',
    'identity',
    'document',
    'assumption',
    'calendar',
    'future',
    'missing',
  ])('外层重新标摘要也拒绝 %s 错配', (change) => {
    const { request, response, envelope } = navSourceFixture();
    if (change === 'pageHash') envelope.navSource.pages[0]!.contentHash = 'b'.repeat(64);
    else if (change === 'pageState') {
      const page = envelope.navSource.pages[0]!;
      page.rawResponse = page.rawResponse.replace('"Success":true', '"Success":false');
      page.contentHash = navHash(page.rawResponse);
    } else if (change === 'batchHash') envelope.navSource.contentHash = 'b'.repeat(64);
    else if (change === 'native') envelope.records[0]!.nativeRecordRaw = '{}';
    else if (change === 'identity') envelope.identity.sourceType = 'QDII-普通股票';
    else if (change === 'document')
      envelope.ruleDocument.raw = Buffer.from('changed').toString('base64');
    else if (change === 'assumption') envelope.assumptionRaw = response.assumptionRaw = '{}';
    else if (change === 'calendar') envelope.calendarRaw = response.calendarRaw = '{}';
    else if (change === 'future') envelope.identity.capturedAt = '2026-10-02T00:00:00Z';
    else envelope.records.pop();
    response.responseRaw = navCanonical(envelope);
    response.source.responseHash = navHash(response.responseRaw);
    expect(() => parseNavResponseV3(response, request)).toThrow();
  });
  it('拒绝重复字段、执行语法及超深原文，接受裸键数据和转义字符串', () => {
    for (const raw of [
      '{"a":1,"a":2}',
      '{"a":1,"\\u0061":2}',
      '{datas:(()=>1)()}',
      '['.repeat(65) + ']'.repeat(65),
    ]) {
      expect(() => parseNavRaw(raw, true)).toThrow();
    }
    expect(parseNavRaw('{datas:["a\\"b","{key:"]}', true)).toEqual({ datas: ['a"b', '{key:'] });
  });
  it('来源未知类型即使同步修改身份摘要仍拒绝', () => {
    const { request, response, envelope } = navSourceFixture();
    envelope.identity.sourceType = '指数型-未知';
    envelope.identity.responseRaw = envelope.identity.responseRaw.replace(
      '指数型-股票',
      '指数型-未知',
    );
    envelope.identity.responseHash = navHash(envelope.identity.responseRaw);
    response.responseRaw = navCanonical(envelope);
    response.source.responseHash = navHash(response.responseRaw);
    expect(() => parseNavResponseV3(response, request)).toThrow();
  });
  it('规则文件内容和自身摘要一起修改仍须匹配用户决定', () => {
    const { request, response, envelope } = navSourceFixture();
    const doc = request.domesticRuleDecisionRaw!.replace('T+1', '另一口径');
    const value = { ...JSON.parse(response.ruleRaw), documentHash: navHash(doc) };
    response.ruleRaw = envelope.ruleRaw = navCanonical(value);
    response.navVisibility.rule = { ...value, contentHash: navHash(response.ruleRaw) };
    for (const fact of response.facts)
      fact.publicationEvidence.ruleHash = response.navVisibility.rule.contentHash;
    const assumption = {
      ...JSON.parse(response.assumptionRaw),
      ruleHash: response.navVisibility.rule.contentHash,
    };
    response.assumptionRaw = envelope.assumptionRaw = navCanonical(assumption);
    envelope.ruleDocument.raw = Buffer.from(doc).toString('base64');
    envelope.ruleDocument.contentHash = navHash(doc);
    response.responseRaw = navCanonical(envelope);
    response.source.responseHash = navHash(response.responseRaw);
    expect(() => parseNavResponseV3(response, request)).toThrow();
  });
  it('鉴权、请求关联及不跟随重定向，成功只调用一次', async () => {
    const { request, response } = navSourceFixture();
    const fetch = vi.fn(async (_url, init) => {
      expect(init.redirect).toBe('error');
      expect(init.headers.authorization).toBe('Bearer test-token');
      expect(init.headers['x-request-id']).toBe(request.requestId);
      expect(JSON.parse(init.body)).toEqual(request);
      return new Response(JSON.stringify(response));
    });
    vi.stubGlobal('fetch', fetch);
    expect((await client().read(request)).facts).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([
    [401, 'unauthorized'],
    [404, 'unsupported-capability'],
    [503, 'unavailable'],
    [422, 'insufficient-coverage'],
  ])('HTTP %i 保留稳定错误且不重试', async (status, code) => {
    const { request } = navSourceFixture();
    const body = {
      contractVersion: 3,
      requestId: request.requestId,
      error: {
        code: status === 503 ? 'upstream_failure' : 'insufficient_evidence',
        message: '不可用',
      },
    };
    const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status: Number(status) }));
    vi.stubGlobal('fetch', fetch);
    await expect(client().read(request)).rejects.toMatchObject({ code });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('拒绝错误响应的请求关联错配', async () => {
    const { request } = navSourceFixture();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              contractVersion: 3,
              requestId: 'other',
              error: { code: 'upstream_failure', message: '无效' },
            }),
            { status: 503 },
          ),
      ),
    );
    await expect(client().read(request)).rejects.toMatchObject({ code: 'invalid-response' });
  });
  it('单调时间预算超限时拒绝结果，不依赖事件循环及时触发超时', async () => {
    const { request, response } = navSourceFixture();
    let now = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        now = 6000;
        return new Response(JSON.stringify(response));
      }),
    );
    await expect(client().read(request)).rejects.toMatchObject({ code: 'timeout' });
  });
  it('未知长度仍执行流量预算并拒绝无效 UTF-8', async () => {
    const signal = AbortSignal.timeout(5000);
    await expect(readNavHttpBody(new Response('123456'), signal, 3)).rejects.toMatchObject({
      code: 'invalid-response',
    });
    await expect(
      readNavHttpBody(new Response(new Uint8Array([255])), signal),
    ).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(
      readNavHttpBody(new Response('ok', { headers: { 'content-length': '999' } }), signal, 3),
    ).rejects.toMatchObject({ code: 'invalid-response' });
  });
});
