import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { backupDatabaseForUpgrade } from '../../src/platform/database-upgrade-backup.js';
import { restoreDatabaseUpgradeBackup } from '../../src/platform/database-upgrade-restore.js';
import { createUpgradeIsolation, runUpgradeIsolationSql } from '../../src/platform/database-upgrade-isolation.js';

const container = process.env.DATABASE_BACKUP_TEST_CONTAINER;
const isolatedDescribe = container ? describe : describe.skip;
function docker(args: string[], input?: Buffer | string) {
  if (container !== 'tl-upgrade-backup-check-20260927') throw new Error('只允许指定隔离容器');
  return execFileSync('docker', ['exec', '-i', container, ...args], { input, encoding: 'utf8' });
}

isolatedDescribe('数据库备份与恢复', () => {
  let directory: string;
  afterAll(async () => { if (directory) await rm(directory, { recursive: true }); });
  it('真实 custom dump 可恢复，摘要和大小一致，禁止覆盖已有备份', async () => {
    directory = await mkdtemp(join(tmpdir(), 'tl-upgrade-backup-'));
    docker(['psql', '-U', 'postgres', '-d', 'backup_fixture', '-v', 'ON_ERROR_STOP=1'],
      'CREATE TABLE sentinel (id INT PRIMARY KEY, value TEXT); INSERT INTO sentinel VALUES (1, \'保留原数据\');');
    const outputPath = join(directory, 'backup.dump');
    const result = await backupDatabaseForUpgrade(container!, { databaseName: 'backup_fixture', ownerName: 'postgres' }, outputPath);
    const bytes = await readFile(outputPath);
    expect(bytes.length).toBe(result.backupBytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(result.backupSha256);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    const isolation = await createUpgradeIsolation(container!, result.target);
    try {
      const { container: destination, isolationToken: token } = isolation;
      await expect(restoreDatabaseUpgradeBackup(result, container!, token)).rejects.toThrow();
      await expect(restoreDatabaseUpgradeBackup(result, destination, 'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee')).rejects.toThrow();
      await expect(restoreDatabaseUpgradeBackup({ ...result, backupSha256: '0'.repeat(64) }, destination, token)).rejects.toThrow();
      await restoreDatabaseUpgradeBackup(result, destination, token);
      expect(await runUpgradeIsolationSql(destination, result.target, 'SELECT value FROM sentinel WHERE id=1;', token))
        .toBe('保留原数据');
      await expect(runUpgradeIsolationSql(destination, result.target, 'SELECT 1;',
        'ffffffff-bbbb-cccc-dddd-eeeeeeeeeeee')).rejects.toThrow();
      await expect(restoreDatabaseUpgradeBackup(result, destination, token)).rejects.toThrow('不为空');
    } finally {
      await isolation.dispose();
    }
    await expect(backupDatabaseForUpgrade(container!, { databaseName: 'backup_fixture', ownerName: 'postgres' }, outputPath))
      .rejects.toThrow();
    expect(await readFile(outputPath)).toEqual(bytes);
  }, 30_000);
});
