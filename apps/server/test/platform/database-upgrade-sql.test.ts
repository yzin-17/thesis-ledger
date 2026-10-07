import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildDatabaseUpgradeSql } from '../../src/platform/database-upgrade-sql.js';
import { planDatabaseUpgrade } from '../../src/platform/database-upgrade-plan.js';
import type { DatabaseStructureInput } from '../../src/platform/database-structure.js';

const target = { databaseName: 'fixture', ownerName: 'fixture_owner' };
const fromHead = '20260901000000_base';
const permissions = 'GRANT SELECT ON ALL TABLES IN SCHEMA public TO fixture_reader;';
const source: DatabaseStructureInput = {
  migrations: [
    { name: fromHead, sqlPath: '', sql: 'CREATE TABLE "Old" (id INT);' },
    { name: '20260902000000_next', sqlPath: '', sql: 'BEGIN;\nCREATE TABLE "New" (id INT);\nCOMMIT;' },
  ], currentHead: '20260902000000_next', expectedTables: ['Old', 'New'], prismaTables: ['Old', 'New'], rawOwnedTables: [],
};
function confirmation() {
  return { planFingerprint: planDatabaseUpgrade(source, fromHead, target).fingerprint,
    permissionsSha256: createHash('sha256').update(permissions).digest('hex') };
}

describe('增量升级事务生成', () => {
  it('仅执行增量并在权限/结构校验成功后更新 head', () => {
    const sql = buildDatabaseUpgradeSql(source, fromHead, target, confirmation(), permissions);
    expect(sql).not.toContain('CREATE TABLE "Old"');
    expect(sql).not.toContain('DROP SCHEMA');
    expect(sql.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(sql.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(sql.indexOf('database upgrade target mismatch')).toBeLessThan(sql.indexOf('CREATE TABLE "New"'));
    expect(sql.indexOf('database upgrade source head mismatch')).toBeLessThan(sql.indexOf('CREATE TABLE "New"'));
    expect(sql.indexOf('GRANT SELECT')).toBeLessThan(sql.indexOf('UPDATE "SchemaVersion"'));
    expect(sql.indexOf('database upgrade structure incomplete')).toBeLessThan(sql.indexOf('UPDATE "SchemaVersion"'));
  });
  it('旧计划、权限变化或非事务权限脚本拒绝生成', () => {
    expect(() => buildDatabaseUpgradeSql(source, fromHead, target,
      { ...confirmation(), planFingerprint: 'changed' }, permissions)).toThrow();
    expect(() => buildDatabaseUpgradeSql(source, fromHead, target, confirmation(), `${permissions}\n-- change`)).toThrow();
    const invalid = 'SELECT 1;\nCOMMIT;\nSELECT 2;';
    expect(() => buildDatabaseUpgradeSql(source, fromHead, target,
      { ...confirmation(), permissionsSha256: createHash('sha256').update(invalid).digest('hex') }, invalid)).toThrow();
  });
});
