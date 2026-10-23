import { PrismaClient } from '@prisma/client';
import { pathToFileURL } from 'node:url';
import {
  AiPricingMigrationError,
  applyAiProviderPricingMigration,
  previewAiProviderPricingMigration,
} from './ai-provider-pricing-migration.js';

export function parsePricingMigrationArguments(args: readonly string[]) {
  const names: string[] = [];
  const flags = new Map<string, string>();
  let apply = false;
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index]!;
    if (key === '--apply' && !apply) {
      apply = true;
      continue;
    }
    if (
      !['--provider', '--expected-fingerprint', '--expected-database', '--expected-role'].includes(
        key,
      )
    )
      throw new AiPricingMigrationError('ARGUMENT_INVALID', '迁移参数未知或重复');
    const value = args[++index];
    if (!value?.trim() || value.startsWith('--'))
      throw new AiPricingMigrationError('ARGUMENT_INVALID', '迁移参数缺少值');
    if (key === '--provider') names.push(value);
    else {
      if (flags.has(key)) throw new AiPricingMigrationError('ARGUMENT_INVALID', '迁移参数重复');
      flags.set(key, value);
    }
  }
  const fingerprint = flags.get('--expected-fingerprint');
  const database = flags.get('--expected-database');
  const role = flags.get('--expected-role');
  if (apply && (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint) || !database || !role))
    throw new AiPricingMigrationError('ARGUMENT_INVALID', '应用迁移必须提供预览指纹和数据库/角色');
  if (!apply && flags.size > 0)
    throw new AiPricingMigrationError('ARGUMENT_INVALID', '预期状态参数只能用于显式应用');
  return { apply, names: [...new Set(names)].sort(), fingerprint, database, role };
}

export async function runPricingMigrationCli(args: readonly string[]) {
  const options = parsePricingMigrationArguments(args);
  const prisma = new PrismaClient();
  try {
    if (options.apply) {
      const result = await applyAiProviderPricingMigration(prisma, {
        fingerprint: options.fingerprint!,
        identity: { database: options.database!, role: options.role! },
        providerNames: options.names,
      });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } else {
      const result = await previewAiProviderPricingMigration(prisma, options.names);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void runPricingMigrationCli(process.argv.slice(2)).catch((error: unknown) => {
    const known = error instanceof AiPricingMigrationError;
    process.stderr.write(
      `${JSON.stringify({
        code: known ? error.code : 'MIGRATION_FAILED',
        message: known ? error.message : '价格迁移失败，事务未提交；请检查维护结果',
      })}\n`,
    );
    process.exitCode = 1;
  });
