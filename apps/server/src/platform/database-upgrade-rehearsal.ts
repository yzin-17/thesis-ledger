import { z } from 'zod';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.iso.datetime({ offset: true });
const identity = z.strictObject({ databaseName: z.string().trim().min(1), ownerName: z.string().trim().min(1) });
const evidenceSchema = z.strictObject({
  version: z.literal('database-upgrade-rehearsal-v1'),
  target: identity,
  appRole: z.string().trim().min(1),
  planFingerprint: digest,
  permissionsSha256: digest,
  backupSha256: digest,
  backupBytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  consumersStoppedAt: instant,
  backupStartedAt: instant,
  backupCompletedAt: instant,
  restoreCompletedAt: instant,
  upgradeCompletedAt: instant,
  validatedAt: instant,
  checks: z.strictObject({
    restoredSourceHead: z.string().min(1),
    upgradedHead: z.string().min(1),
    structureComplete: z.literal(true),
    appRolePermissions: z.literal(true),
    preservedData: z.literal(true),
  }),
});

/** 校验受信执行入口产生的演练记录；字段匹配不能替代真实恢复和数据核验。 */
export function validateDatabaseUpgradeRehearsal(
  evidence: unknown,
  current: {
    target: z.infer<typeof identity>; appRole: string; planFingerprint: string; permissionsSha256: string;
    backupSha256: string; backupBytes: number; fromHead: string; toHead: string;
    consumersStoppedAt: string; now: string;
  },
) {
  const result = evidenceSchema.parse(evidence);
  if (result.appRole !== current.appRole || result.appRole === result.target.ownerName ||
      result.target.databaseName !== current.target.databaseName || result.target.ownerName !== current.target.ownerName ||
      result.planFingerprint !== current.planFingerprint || result.permissionsSha256 !== current.permissionsSha256 ||
      result.backupSha256 !== current.backupSha256 || result.backupBytes !== current.backupBytes ||
      result.checks.restoredSourceHead !== current.fromHead || result.checks.upgradedHead !== current.toHead ||
      result.consumersStoppedAt !== current.consumersStoppedAt)
    throw new Error('升级演练与当前目标、输入或消费者停止批次不匹配');
  const times = [result.consumersStoppedAt, result.backupStartedAt, result.backupCompletedAt,
    result.restoreCompletedAt, result.upgradeCompletedAt, result.validatedAt, instant.parse(current.now)].map(Date.parse);
  if (times.some((value, index) => index > 0 && value < times[index - 1]!))
    throw new Error('升级演练时间顺序无效');
  return result;
}
