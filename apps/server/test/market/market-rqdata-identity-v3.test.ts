import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { marketEventRequestV3Schema, marketEventResponseV3Schema } from '@thesis-ledger/schemas';
import { rqdataEventFixture } from './rqdata-event-fixtures.js';
import { verifyRqdataFundIdentityV3 } from '../../src/market/market-rqdata-identity-v3.js';
import { selectMarketEventV3 } from '../../src/market/market-event-selector-v3.js';

function selectionFixture() {
  const exchange = rqdataEventFixture();
  const { routeTarget, ...scope } = marketEventRequestV3Schema.parse(exchange.request);
  const target = { providerId: routeTarget.providerId, upstreamSource: routeTarget.upstreamSource };
  const read = vi.fn(async () => exchange.response);
  return {
    exchange,
    input: {
      scope,
      read,
      effective: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        requestId: 'identity-policy',
        revision: 1,
        sourceDesiredRevision: 1,
        enabled: true,
        appliedAt: '2026-09-27T11:00:00Z',
        routes: [
          {
            key: scope.routeKey,
            reason: null,
            targets: [{ ...routeTarget, eligible: true, reason: null }],
          },
        ],
      },
      catalog: {
        contractVersion: 3,
        consumer: 'thesis-ledger',
        catalogRevision: 1,
        generatedAt: '2026-09-27T11:00:00Z',
        integrity: 'complete',
        entries: [{ key: scope.routeKey, target, state: 'ready' }],
      },
    },
  };
}

describe('RQData 身份原文执行端校验', () => {
  it.each(['CASH_DISTRIBUTION', 'SPLIT_EVENT'] as const)(
    '接受 %s 的原始 UTF-8 摘要',
    (capability) => {
      const response = marketEventResponseV3Schema.parse(rqdataEventFixture(capability).response);
      expect(() => verifyRqdataFundIdentityV3(response)).not.toThrow();
      expect(response.coverage.complete).toBe(false);
    },
  );

  it('语义相同的 JSON 空白改变仍拒绝原文摘要', () => {
    const fixture = rqdataEventFixture();
    fixture.response.identityEvidence.content += ' ';
    const response = marketEventResponseV3Schema.parse(fixture.response);
    expect(() => verifyRqdataFundIdentityV3(response)).toThrow('原文摘要无效');
  });

  it('按 UTF-8 字节限制原文，即使字符数量仍在 Schema 上限内', () => {
    const fixture = rqdataEventFixture();
    const bundle = JSON.parse(fixture.response.identityEvidence.content);
    bundle.mappings[0].identityEvidence.documentUrl += `?label=${'中'.repeat(360_000)}`;
    const content = JSON.stringify(bundle);
    const sha256 = createHash('sha256').update(content).digest('hex');
    fixture.response.identityEvidence = { content, sha256, ref: `sha256:${sha256}` };
    fixture.response.admission.evidenceRef = `sha256:${sha256}`;
    fixture.response.admission.evidenceSha256 = sha256;
    const response = marketEventResponseV3Schema.parse(fixture.response);
    expect(content.length).toBeLessThan(1024 * 1024);
    expect(Buffer.byteLength(content)).toBeGreaterThan(1024 * 1024);
    expect(() => verifyRqdataFundIdentityV3(response)).toThrow('原文摘要无效');
  });

  it('在线观测保留身份原文和未证明覆盖状态', async () => {
    const { input, exchange } = selectionFixture();
    const result = await selectMarketEventV3(input);
    expect(result).toEqual({ status: 'observed', ...exchange });
    expect(input.read).toHaveBeenCalledOnce();
  });

  it('在线原文摘要失败时停止，不再次读取或切换来源', async () => {
    const { input, exchange } = selectionFixture();
    exchange.response.identityEvidence.content += ' ';
    expect(await selectMarketEventV3(input)).toMatchObject({
      status: 'unavailable',
      reason: 'invalid_response',
    });
    expect(input.read).toHaveBeenCalledOnce();
  });
});
