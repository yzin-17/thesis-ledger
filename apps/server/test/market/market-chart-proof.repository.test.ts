import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  marketRouteCompatibilityObservationV3Schema,
  marketRouteCompatibilityProofV3Schema,
} from '@thesis-ledger/schemas';
import { MarketChartProofRepository } from '../../src/market/market-chart-proof.repository.js';

const config = vi.hoisted(() => ({
  marketChartCompatibilityFile: '',
  marketChartCompatibilitySha256: '',
}));
vi.mock('../../src/platform/config.js', () => ({ loadConfig: () => config }));
const sample = () => {
  const raw = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/schemas/fixtures/market-route-compatibility-v3.synthetic.json',
        import.meta.url,
      ),
      'utf8',
    ),
  );
  return {
    desiredRevision: 1,
    effectivePolicyRevision: 2,
    catalogRevision: 3,
    proof: marketRouteCompatibilityProofV3Schema.parse(raw.proof),
    observation: marketRouteCompatibilityObservationV3Schema.parse(raw.observation),
  };
};
let directory: string;
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
  directory = await mkdtemp(join(tmpdir(), 'chart-proof-'));
  config.marketChartCompatibilityFile = join(directory, 'proof.json');
  config.marketChartCompatibilitySha256 = '';
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});
const install = async (value: unknown) => {
  const bytes = JSON.stringify(value);
  await writeFile(config.marketChartCompatibilityFile, bytes);
  config.marketChartCompatibilitySha256 = createHash('sha256').update(bytes).digest('hex');
};
const setup = async () => {
  const entry = sample();
  const bundle = { contractVersion: 3, entries: [entry] };
  await install(bundle);
  const { sourceFacts, ...identity } = entry.observation;
  void sourceFacts;
  return {
    entry,
    bundle,
    repo: new MarketChartProofRepository(),
    lookup: { ...identity, desiredRevision: 1, effectivePolicyRevision: 2, catalogRevision: 3 },
  };
};

describe('图表审核证明包只读查找', () => {
  it('摘要固定的精确有效记录可读', async () => {
    const { repo, lookup, entry } = await setup();
    expect(await repo.findExact(lookup)).toEqual({
      proof: entry.proof,
      observation: entry.observation,
    });
  });
  it.each(['desiredRevision', 'effectivePolicyRevision', 'catalogRevision'] as const)(
    '拒绝 %s 改变',
    async (key) => {
      const { repo, lookup } = await setup();
      lookup[key] += 1;
      expect(await repo.findExact(lookup)).toBeNull();
    },
  );
  it.each(['window', 'target', 'symbol'] as const)('拒绝 %s 错配', async (kind) => {
    const { repo, lookup } = await setup();
    if (kind === 'window') lookup.window = { ...lookup.window, start: '2025-02-02' };
    if (kind === 'target')
      lookup.targets = {
        ...lookup.targets,
        backup: { providerId: 'other', upstreamSource: 'other' },
      };
    if (kind === 'symbol') lookup.symbol = 'OTHER';
    expect(await repo.findExact(lookup)).toBeNull();
  });
  it('过期和重复匹配均拒绝', async () => {
    const { repo, lookup, bundle, entry } = await setup();
    vi.setSystemTime(new Date('2027-01-01T00:00:00Z'));
    expect(await repo.findExact(lookup)).toBeNull();
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'));
    bundle.entries.push(entry);
    await install(bundle);
    expect(await repo.findExact(lookup)).toBeNull();
  });
  it('删除撤销不返回上次有效缓存', async () => {
    const { repo, lookup } = await setup();
    expect(await repo.findExact(lookup)).not.toBeNull();
    await rm(config.marketChartCompatibilityFile);
    expect(await repo.findExact(lookup)).toBeNull();
  });
  it('文件改动没有同步摘要时拒绝', async () => {
    const { repo, lookup } = await setup();
    await writeFile(config.marketChartCompatibilityFile, '{}');
    expect(await repo.findExact(lookup)).toBeNull();
  });
  it('无配置、损坏和超限均关闭供给', async () => {
    const { repo, lookup } = await setup();
    config.marketChartCompatibilitySha256 = '';
    expect(await repo.findExact(lookup)).toBeNull();
    await install({ contractVersion: 3, entries: ['invalid'] });
    expect(await repo.findExact(lookup)).toBeNull();
    await install('x'.repeat(1_048_577));
    expect(await repo.findExact(lookup)).toBeNull();
  });
});
