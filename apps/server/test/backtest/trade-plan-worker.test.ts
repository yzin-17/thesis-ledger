import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { DecimalValue as D } from '@thesis-ledger/domain';
import { tradePlanSnapshot } from './trade-plan-snapshot.fixture.js';

it('正式冻结快照 Worker：分批减仓与追踪退出、期末和离线回放一致', async () => {
  const root = await mkdtemp(join(tmpdir(), 'trade-plan-worker-'));
  try {
    const fixture = await tradePlanSnapshot(root);
    const result = fixture.execute();
    expect(result.fills.map((f) => f.side)).toEqual(['buy', 'sell', 'sell']);
    expect(D.from(result.fills[1]!.quantity).times('2').compareTo(result.fills[0]!.quantity)).toBe(
      0,
    );
    expect(result.fills[2]!.quantity).toBe(result.fills[1]!.quantity);
    expect(result.fills.map((f) => f.price)).toEqual(['10.01', '10.989', '10.989']);
    expect(fixture.execute()).toEqual(result);
    const worker = await fixture.run();
    expect(worker.completeness).toBe('complete');
    expect(await fixture.run()).toEqual(worker);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
