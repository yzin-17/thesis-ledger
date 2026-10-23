import assert from 'node:assert/strict';
import { createRecoveryRuntime, prepareUnsent } from './research-recovery-runtime.mjs';

const [phase, runId, origin] = process.argv.slice(2);
assert(['park-queued', 'park-prepared', 'execute', 'execute-crash', 'recover', 'cancel'].includes(phase));
assert(/^[a-f0-9-]{36}$/.test(runId));
const runtime = await createRecoveryRuntime(origin);
const send = value => process.send?.(value);
try {
  if (phase === 'park-queued' || phase === 'park-prepared') {
    const prepared = phase === 'park-prepared' ? await prepareUnsent(runtime, runId) : null;
    send({ phase, ready: true, ...prepared });
    setInterval(() => undefined, 1000);
    await new Promise(() => {});
  } else if (phase === 'recover') {
    await runtime.runs.recoverStaleRuns(); send({ phase, complete: true });
  } else if (phase === 'cancel') {
    const { owner, access } = await import('./research-recovery-runtime.mjs');
    const row = await runtime.prisma.aiRun.findUniqueOrThrow({ where: { id: runId } });
    const submission = row.modelMetadata.frozenResearch.request;
    const first = await runtime.runs.cancelResearchSubmissionV2(owner, submission, access);
    const second = await runtime.runs.cancelResearchSubmissionV2(owner, submission, access);
    assert.deepEqual(first, second); send({ phase, complete: true });
  } else {
    if (phase === 'execute-crash') {
      const claim = runtime.runs.claim.bind(runtime.runs);
      runtime.runs.claim = id => claim(id, 1000);
    }
    process.on('message', message => {
      if (message === 'abort') runtime.executor.cancelActive(runId);
    });
    await runtime.executor.execute(runId); send({ phase, complete: true });
  }
} finally {
  await runtime.close(); process.disconnect?.();
}
