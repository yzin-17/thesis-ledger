import assert from 'node:assert/strict';
import { ThesisLedgerApiClient } from '../packages/api-client/dist/index.js';

export async function verifyRecoveryReads(baseUrl, probe) {
  assert.equal(new URL(baseUrl).hostname, '127.0.0.1');
  let requests = 0;
  const client = new ThesisLedgerApiClient(baseUrl + '/', async (input, init) => {
    assert.equal(init?.method ?? 'GET', 'GET'); requests += 1;
    return fetch(input, { ...init, signal: AbortSignal.timeout(15_000) });
  });
  const capability = await client.research.capabilities(); assert.equal(capability.canCreate, false);
  for (const item of probe.outcomes) {
    const read = await client.research.detail(item.id, { view: 'scoped', mode: 'shadow' });
    assert.equal(read.status, item.status);
    if (item.status === 'succeeded') {
      assert.equal(read.availability, 'available'); assert.equal(read.result.version, 2);
      const reference = read.result.evidenceBindings[0].audit.evidenceId;
      const material = await client.research.evidence(item.id, reference, { view: 'scoped', mode: 'shadow' });
      assert.equal(material.evidence.data.price, 100);
    } else assert.equal(read.result, null);
  }
  return { requests, outcomesRead: probe.outcomes.length, frozenEvidenceReads: 3, creationDisabled: true };
}
