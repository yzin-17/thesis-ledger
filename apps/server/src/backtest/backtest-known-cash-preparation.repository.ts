import { mkdir, readFile, writeFile, link, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { BacktestKnownCashPreparationV3 } from '@thesis-ledger/schemas';
import { canonicalizeManifest } from './backtest-snapshot.js';
import { verifyKnownCashPreparationV3 } from './backtest-known-cash-preparation-v3.js';

/** Server实际取得的原包；创建不能用客户端自洽摘要替代此来源绑定。 */
export class BacktestKnownCashPreparationRepository {
  constructor(private readonly rootDirectory: string) {}

  private path(hash: string): string {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('现金准备摘要无效');
    return resolve(this.rootDirectory, 'preparations', 'known-cash', `${hash}.json`);
  }

  async save(prepared: BacktestKnownCashPreparationV3): Promise<void> {
    const verified = verifyKnownCashPreparationV3(prepared, prepared.contentHash);
    const path = this.path(verified.contentHash);
    const staging = `${path}.staging-${randomUUID()}`;
    await mkdir(resolve(this.rootDirectory, 'preparations', 'known-cash'), { recursive: true });
    try {
      await writeFile(staging, canonicalizeManifest(verified), { flag: 'wx' });
      await link(staging, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      await this.assertOriginal(verified);
    } finally {
      await rm(staging, { force: true });
    }
  }

  async assertOriginal(
    submitted: BacktestKnownCashPreparationV3,
  ): Promise<BacktestKnownCashPreparationV3> {
    const verified = verifyKnownCashPreparationV3(submitted, submitted.contentHash);
    let original: BacktestKnownCashPreparationV3;
    try {
      const value: unknown = JSON.parse(await readFile(this.path(verified.contentHash), 'utf8'));
      original = verifyKnownCashPreparationV3(value, verified.contentHash);
    } catch {
      throw new Error('Server原始现金准备包缺失或无效，请重新准备');
    }
    if (canonicalizeManifest(original) !== canonicalizeManifest(verified))
      throw new Error('现金准备包与Server原包不同，请重新准备');
    return original;
  }

  async read(hash: string): Promise<BacktestKnownCashPreparationV3> {
    const value: unknown = JSON.parse(await readFile(this.path(hash), 'utf8'));
    return verifyKnownCashPreparationV3(value, hash);
  }
}
