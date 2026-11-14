import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { queueArguments } from './arena-maintenance-queue.mjs';

test('队列维护必须明确操作，并保管私有归属回执', () => {
  const path = resolve('.recovery-artifacts/controlled-queue/owner.json');
  assert.deepEqual(queueArguments(['pause', path]), { mode: 'pause', path });
  assert.throws(() => queueArguments(['pause', '/tmp/public.json']));
  assert.throws(() => queueArguments(['cancel', path]));
});
