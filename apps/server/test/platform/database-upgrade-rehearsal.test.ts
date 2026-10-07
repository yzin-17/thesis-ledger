import { describe, expect, it } from 'vitest';
import { validateDatabaseUpgradeRehearsal } from '../../src/platform/database-upgrade-rehearsal.js';

const time = '2026-09-27T00:00:00Z';
function fixture() {
  const current = { target: { databaseName: 'fixture', ownerName: 'owner' }, appRole: 'app', planFingerprint: 'a'.repeat(64),
    permissionsSha256: 'b'.repeat(64), backupSha256: 'c'.repeat(64), backupBytes: 1024,
    fromHead: 'old', toHead: 'new', consumersStoppedAt: time, now: time };
  const evidence = { version: 'database-upgrade-rehearsal-v1', target: { ...current.target }, appRole: current.appRole,
    planFingerprint: current.planFingerprint, permissionsSha256: current.permissionsSha256,
    backupSha256: current.backupSha256, backupBytes: current.backupBytes,
    consumersStoppedAt: time, backupStartedAt: time, backupCompletedAt: time,
    restoreCompletedAt: time, upgradeCompletedAt: time, validatedAt: time,
    checks: { restoredSourceHead: 'old', upgradedHead: 'new', structureComplete: true,
      appRolePermissions: true, preservedData: true } };
  return { current, evidence };
}

describe('保留数据升级演练绑定', () => {
  it('拒绝应用角色变化或使用数据库 owner 作为应用角色', () => {
    const f = fixture();
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, { ...f.current, appRole: 'another' })).toThrow();
    f.evidence.appRole = 'owner';
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, { ...f.current, appRole: 'owner' })).toThrow();
  });
  it('接受同一目标、备份和停止批次的完整记录', () => {
    const f = fixture();
    expect(validateDatabaseUpgradeRehearsal(f.evidence, f.current)).toEqual(f.evidence);
  });
  it.each(['planFingerprint', 'permissionsSha256', 'backupSha256'] as const)('拒绝更换 %s', (field) => {
    const f = fixture();
    f.current[field] = 'd'.repeat(64);
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, f.current)).toThrow();
  });
  it.each(['structureComplete', 'appRolePermissions', 'preservedData'] as const)('拒绝未完成的 %s', (field) => {
    const f = fixture();
    f.evidence.checks[field] = false;
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, f.current)).toThrow();
  });
  it('拒绝停止批次变化、备份大小变化和未来证据', () => {
    const f = fixture();
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, { ...f.current, backupBytes: 2048 })).toThrow();
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, { ...f.current, consumersStoppedAt: '2026-09-27T01:00:00Z' })).toThrow();
    f.evidence.validatedAt = '2026-09-27T01:00:00Z';
    expect(() => validateDatabaseUpgradeRehearsal(f.evidence, f.current)).toThrow();
  });
});
