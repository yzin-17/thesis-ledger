import { mkdtemp, chmod, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ArtifactCorruptionError,
  ArtifactNotFoundError,
  LocalArtifactStore,
} from '../apps/server/src/backtest/backtest-artifact-store.js';

const main = async () => {
  const root = await mkdtemp(join(tmpdir(), 'thesis-ledger-backtest-v2-artifact-'));
  try {
    const store = new LocalArtifactStore(root);
    const ref = await store.put({ key: 'faults/original.parquet', rows: [{ value: 'ok' }] });
    await store.delete(ref);
    let missing = false;
    try {
      await store.openRead(ref);
    } catch (error) {
      missing = error instanceof ArtifactNotFoundError && error.code === 'ARTIFACT_NOT_FOUND';
    }

    const corruptRef = await store.put({ key: 'faults/corrupt.parquet', rows: [{ value: 'ok' }] });
    await writeFile(join(root, corruptRef.key), Buffer.from('corrupt'));
    let corrupt = false;
    try {
      await store.openRead(corruptRef);
    } catch (error) {
      corrupt = error instanceof ArtifactCorruptionError && error.code === 'ARTIFACT_CORRUPT';
    }

    await chmod(join(root, 'faults'), 0o555);
    let readonly = false;
    try {
      await store.put({ key: 'faults/readonly.parquet', rows: [{ value: 'blocked' }] });
    } catch (error) {
      readonly = (error as NodeJS.ErrnoException).code === 'EACCES';
    } finally {
      await chmod(join(root, 'faults'), 0o755);
    }
    const status = missing && corrupt && readonly ? 'passed' : 'failed';
    console.log(
      JSON.stringify({
        gate: 'backtest-v2-artifact-fault-smoke',
        status,
        faults: { missing, corrupt, readonly, enospc: 'not-injected' },
        note: 'ENOSPC 需要受控配额/临时卷；本 smoke 不修改工作树或 Docker volume。',
      }),
    );
    if (status !== 'passed') process.exitCode = 1;
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
