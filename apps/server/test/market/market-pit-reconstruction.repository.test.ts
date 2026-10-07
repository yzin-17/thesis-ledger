import { createHash } from 'node:crypto';
import { mkdtemp, writeFile, rm, truncate } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketPitReconstructionRepository } from '../../src/market/market-pit-reconstruction.repository.js';
import { pitReconstructionFixture } from './pit-reconstruction-fixture.js';

const config = vi.hoisted(() => ({
  marketPitReconstructionFile: '',
  marketPitReconstructionSha256: '',
}));
vi.mock('../../src/platform/config.js', () => ({ loadConfig: () => config }));
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'pit-proof-'));
  config.marketPitReconstructionFile = join(directory, 'manifest.json');
  config.marketPitReconstructionSha256 = '';
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const install = async (bytes: string | Buffer) => {
  await writeFile(config.marketPitReconstructionFile, bytes);
  config.marketPitReconstructionSha256 = createHash('sha256').update(bytes).digest('hex');
  return `market-pit-proof-v1:${config.marketPitReconstructionSha256}`;
};
const setup = async () => {
  const f = await pitReconstructionFixture();
  const text = `${JSON.stringify(f.proof, null, 2)}\n`;
  const ref = await install(text);
  return { ...f, text, ref, repo: new MarketPitReconstructionRepository(f.windows) };
};

describe('历史重建清单只读原文与实际归档', () => {
  it('保留精确 UTF-8 原文/摘要和完整归档，不声称历史核验完成', async () => {
    const f = await setup();
    const result = await f.repo.bindContent(f.input, f.ref);
    expect(result).toMatchObject({
      status: 'archives-bound',
      manifestText: f.text,
      manifestHash: config.marketPitReconstructionSha256,
      reconstructionRef: f.ref,
    });
    expect(result?.archives).toHaveLength(1);
    expect(result).not.toHaveProperty('eligible');
  });
  it.each(['arbitrary', 'wrong-hash', 'unconfigured'] as const)(
    '拒绝 %s 引用且不读取归档',
    async (kind) => {
      const f = await setup();
      let ref = f.ref;
      if (kind === 'arbitrary') ref = 'nonempty-ref';
      else if (kind === 'wrong-hash') ref = `market-pit-proof-v1:${'0'.repeat(64)}`;
      else config.marketPitReconstructionSha256 = '';
      expect(await f.repo.bindContent(f.input, ref)).toBeNull();
      expect(f.findUnique).not.toHaveBeenCalled();
    },
  );
  it('文件撤销后不复用已读结果', async () => {
    const f = await setup();
    expect(await f.repo.bindContent(f.input, f.ref)).not.toBeNull();
    await rm(config.marketPitReconstructionFile);
    expect(await f.repo.bindContent(f.input, f.ref)).toBeNull();
  });
  it('文件原文变动而配置摘要不变时拒绝', async () => {
    const f = await setup();
    await writeFile(config.marketPitReconstructionFile, `${f.text} `);
    expect(await f.repo.bindContent(f.input, f.ref)).toBeNull();
    expect(f.findUnique).not.toHaveBeenCalled();
  });
  it.each(['json', 'utf8', 'unknown-field', 'empty', 'too-large', 'directory'] as const)(
    '拒绝 %s 内容或文件形态',
    async (kind) => {
      const f = await setup();
      let ref = f.ref;
      if (kind === 'json') ref = await install('{broken');
      else if (kind === 'utf8') ref = await install(Buffer.from([0xc3, 0x28]));
      else if (kind === 'unknown-field')
        ref = await install(JSON.stringify({ ...f.proof, fetchedAt: f.input.dataAsOf }));
      else if (kind === 'empty') ref = await install('');
      else if (kind === 'too-large') await truncate(config.marketPitReconstructionFile, 33_554_433);
      else config.marketPitReconstructionFile = directory;
      expect(await f.repo.bindContent(f.input, ref)).toBeNull();
      expect(f.findUnique).not.toHaveBeenCalled();
    },
  );
  it('清单及摘要均合法，但归档被删除仍拒绝', async () => {
    const f = await setup();
    f.rows.clear();
    expect(await f.repo.bindContent(f.input, f.ref)).toBeNull();
  });
  it('来源时钟绑定在内容读取之后执行，迟观察整窗仍拒绝', async () => {
    const f = await setup();
    expect(await f.repo.bindSourceTimes(f.input, f.ref)).toEqual({
      status: 'unavailable',
      reason: 'bar-observation-late',
    });
  });
  it('三个实际逐日归档绑定来源时钟并保存原文，但结果仍是必要条件', async () => {
    const f = await setup();
    await f.partitionAtOriginalObservation();
    const text = `${JSON.stringify(f.proof, null, 2)}\n`;
    const ref = await install(text);
    const result = await f.repo.bindSourceTimes(f.input, ref);
    expect(result?.status).toBe('source-times-bound');
    if (result?.status !== 'source-times-bound') throw new Error('缺必要条件');
    expect(result.manifestText).toBe(text);
    expect(result.sourceTimeBindings).toHaveLength(3);
    expect(result).not.toHaveProperty('eligible');
  });
});
