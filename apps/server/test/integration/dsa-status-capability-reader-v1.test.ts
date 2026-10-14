import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { statusCapabilityRequestV1Schema } from '@thesis-ledger/schemas';
import { DsaDataCapabilityReaderV3 } from '../../src/integration/dsa/dsa-data-capability-reader-v3.js';
import { DsaV3ProtocolError } from '../../src/integration/dsa/dsa-v3-protocol.js';

const fixtures = JSON.parse(readFileSync(new URL('../../../../packages/schemas/test/fixtures/market-status-capabilities-v1.shared.json', import.meta.url), 'utf8')).valid;
const reader = (value: unknown) => {
  const post = vi.fn(async () => value);
  return { post, capability: new DsaDataCapabilityReaderV3(post, (read) => read()) };
};
describe('原 V3 Market Reader 的独立状态能力', () => {
  for (const fixture of fixtures) it(`经过原 post 传输 ${fixture.name}`, async () => {
    const { post, capability } = reader(fixture.result);
    const request = statusCapabilityRequestV1Schema.parse(fixture.request);
    expect(await capability.statusCapability(request)).toEqual(fixture.result);
    expect(post).toHaveBeenCalledExactlyOnceWith('/api/v3/thesis-ledger/market/status-capabilities', request, expect.any(Function));
  });
  it.each(['symbol', 'target', 'revision', 'range', 'precision'])('隔离未关联响应 %s', async (field) => {
    const fixture = structuredClone(fixtures.find((item: { name: string }) => item.name === 'RISK_WARNING'));
    if (field === 'symbol') fixture.result.symbol = '000995.SZ';
    if (field === 'target') fixture.result.routeTarget.providerId = 'different-provider';
    if (field === 'revision') fixture.result.policyRevision++;
    if (field === 'range') {
      fixture.result.range.start = '2024-07-14';
      fixture.result.coverage.range.start = '2024-07-14';
    }
    if (field === 'precision') {
      fixture.result.detail = { kind: 'riskCategories', categories: ['delisting', 'other'] };
      fixture.result.coverage.complete = false;
      fixture.result.coverage.unknownDates = ['2024-07-15'];
    }
    const { capability } = reader(fixture.result);
    await expect(capability.statusCapability(statusCapabilityRequestV1Schema.parse(fixture.request)))
      .rejects.toBeInstanceOf(DsaV3ProtocolError);
  });
  it('错误参数在传输前拒绝', () => {
    const fixture = fixtures[0];
    const { post, capability } = reader(fixture.result);
    expect(() => capability.statusCapability({ ...fixture.request, symbol: 'GME.US' })).toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
