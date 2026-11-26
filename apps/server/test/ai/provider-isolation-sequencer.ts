import { BaseSequencer, type TestSpecification } from 'vitest/node';

function isolationPriority(file: TestSpecification) {
  if (file.moduleId.endsWith('/ai-provider-deadline-postgres.integration.test.ts')) return 2;
  if (file.moduleId.endsWith('/ai-provider-cancel-postgres.integration.test.ts')) return 1;
  return 0;
}

/** 将空库断言放在其他样本之后，防止失败优先缓存掩盖跨套件残留。 */
export default class ProviderIsolationSequencer extends BaseSequencer {
  override async sort(files: TestSpecification[]) {
    const ordered = await super.sort(files);
    return ordered.sort((left, right) => isolationPriority(left) - isolationPriority(right));
  }
}
