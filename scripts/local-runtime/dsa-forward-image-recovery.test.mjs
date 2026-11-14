import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { forwardArguments } from './dsa-forward-image-recovery.mjs';

test('前向恢复仅接受明确模式、完整候选摘要和私有恢复目录', () => {
  const image = 'sha256:' + 'a'.repeat(64), directory = resolve('.recovery-artifacts/controlled-forward');
  assert.deepEqual(forwardArguments(['prepare', image, directory]), { mode: 'prepare', candidate: image, directory });
  for (const args of [['prepare', 'latest', directory], ['apply', image, '/tmp/public'],
    ['replace', image, directory], ['prepare', image, directory, '--skip-backup']])
    assert.throws(() => forwardArguments(args));
});
