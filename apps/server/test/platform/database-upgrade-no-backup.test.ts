import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { authorizeNoBackupUpgrade } from '../../src/platform/database-upgrade-no-backup.js';
import { authorized, source, sql } from './database-upgrade-no-backup.fixture.js';

describe('显式不备份开发增列升级', () => {
  it('仅接受原SQL摘要绑定的唯一增列', () => {
    expect(authorizeNoBackupUpgrade(authorized).pendingMigrations).toHaveLength(1);
  });
  it.each(['target', 'owner', 'project', 'hash', 'empty', 'multiple', 'sql'])(
    '拒绝未授权输入 %s', change => {
      const input = structuredClone(authorized);
      if (change === 'target') input.target.databaseName = 'production';
      if (change === 'owner') input.target.ownerName = 'other';
      if (change === 'project') input.project = 'other';
      if (change === 'hash') input.approvedSha256 = '0'.repeat(64);
      if (change === 'empty') input.fromHead = source.currentHead;
      if (change === 'multiple') {
        input.source.currentHead = '20261112030000_extra';
        input.source.migrations.push({ name: input.source.currentHead, sqlPath: '', sql });
      }
      if (change === 'sql') {
        input.source.migrations[1]!.sql += '\nDELETE FROM "OptimizationExperiment";';
        input.approvedSha256 = createHash('sha256').update(input.source.migrations[1]!.sql).digest('hex');
      }
      expect(() => authorizeNoBackupUpgrade(input)).toThrow();
    },
  );
});
