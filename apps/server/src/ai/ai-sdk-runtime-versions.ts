import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { AiAdapter, AiGenerationRuntimeDiagnostic } from '@thesis-ledger/schemas';

const require = createRequire(import.meta.url);
const versions = new Map<string, string | null>();

/** 从实际解析入口向上查找包元数据，不读取依赖声明或环境变量。 */
const resolvedVersion = (name: string): string | null => {
  if (versions.has(name)) return versions.get(name) ?? null;
  let version: string | null = null;
  try {
    let directory = dirname(require.resolve(name));
    for (let depth = 0; depth < 4; depth += 1) {
      try {
        const metadata = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as {
          name?: unknown;
          version?: unknown;
        };
        if (
          metadata.name === name &&
          typeof metadata.version === 'string' &&
          /^[0-9][A-Za-z0-9.+-]{0,79}$/u.test(metadata.version)
        ) {
          version = metadata.version;
          break;
        }
      } catch {
        // 包入口可能位于 dist 等子目录；只在固定深度内继续。
      }
      directory = dirname(directory);
    }
  } catch {
    // 不用声明版本代替未知的实际运行版本。
  }
  versions.set(name, version);
  return version;
};

export const sdkRuntimeVersions = (
  adapter: AiAdapter,
): AiGenerationRuntimeDiagnostic['packages'] => {
  let providerPackage: AiGenerationRuntimeDiagnostic['packages']['providerPackage'] =
    '@ai-sdk/openai-compatible';
  if (adapter === 'openai-chat' || adapter === 'openai-responses')
    providerPackage = '@ai-sdk/openai';
  else if (adapter === 'anthropic-messages') providerPackage = '@ai-sdk/anthropic';
  return {
    ai: resolvedVersion('ai'),
    providerPackage,
    providerVersion: resolvedVersion(providerPackage),
    zod: resolvedVersion('zod'),
  };
};
