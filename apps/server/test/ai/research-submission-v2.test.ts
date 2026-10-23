import { randomUUID } from 'node:crypto';
import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import {
  AiResearchSubmissionV2Store,
  type AiResearchSubmissionV2Access,
} from '../../src/ai/ai-research-submission-v2.store.js';
import { researchSubmissionDigestV2 } from '../../src/ai/ai-research-submission-identity-v2.js';
import { submissionV2Execution, submissionV2Fixture } from './research-submission-v2.fixture.js';

function stack() {
  const rows = new Map<string, Record<string, unknown>>();
  const access = {
    assertSubmission: vi.fn<AiResearchSubmissionV2Access['assertSubmission']>(async () => {}),
    assertSnapshot: vi.fn<AiResearchSubmissionV2Access['assertSnapshot']>(async () => {}),
  };
  const findUnique = vi.fn(
    async (query: {
      where: {
        researchOwnerId_researchSubmissionId: {
          researchOwnerId: string;
          researchSubmissionId: string;
        };
      };
    }) => {
      const identity = query.where.researchOwnerId_researchSubmissionId;
      return structuredClone(
        rows.get(`${identity.researchOwnerId}:${identity.researchSubmissionId}`) ?? null,
      );
    },
  );
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const row = structuredClone({ id: randomUUID(), ...data });
    rows.set(`${data.researchOwnerId}:${data.researchSubmissionId}`, row);
    return row;
  });
  const transaction = { aiRun: { findUnique, create }, $executeRaw: vi.fn(async () => 0) };
  const prisma = {
    $transaction: vi.fn(async (work: (tx: typeof transaction) => Promise<unknown>) =>
      work(transaction),
    ),
  };
  return {
    store: new AiResearchSubmissionV2Store(prisma as never, access),
    rows,
    access,
    findUnique,
    create,
  };
}

describe('V2 研究提交身份与受权找回', () => {
  it('输入键顺序和首尾空白不改变摘要，新的提交标识也不改变内容摘要', () => {
    const { input } = submissionV2Fixture();
    const reordered = {
      ...Object.fromEntries(Object.entries(input).reverse()),
      question: ` ${input.question} `,
      submissionId: randomUUID(),
    };
    expect(researchSubmissionDigestV2(reordered)).toBe(researchSubmissionDigestV2(input));
    const position = {
      ...input,
      scope: {
        scope: 'position',
        accountId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        symbol: 'aapl',
      },
    };
    expect(researchSubmissionDigestV2(position)).toBe(
      researchSubmissionDigestV2({
        ...position,
        scope: {
          ...position.scope,
          accountId: position.scope.accountId.toUpperCase(),
          symbol: 'AAPL',
        },
      }),
    );
  });

  it.each(['question', 'mode', 'scope', 'template', 'settings'] as const)(
    '摘要绑定 %s',
    (field) => {
      const { input } = submissionV2Fixture();
      const changed = structuredClone(input);
      if (field === 'question') changed.question = '另一问题';
      else if (field === 'mode') changed.mode = 'actual';
      else if (field === 'scope')
        changed.scope = { scope: 'instrument', instrumentId: randomUUID() };
      else if (field === 'template') changed.templateId = 'primary-risks';
      else changed.researchSettingsRevision = 'other';
      expect(researchSubmissionDigestV2(changed)).not.toBe(researchSubmissionDigestV2(input));
    },
  );

  it('第一次提交原子传入快照与冻结包，重复提交返回原任务并保留原材料', async () => {
    const { store, create, access } = stack();
    const owner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    const prepare = vi.fn(async () => submissionV2Execution());
    const first = await store.submit(owner, frozen, prepare);
    const later = structuredClone(frozen);
    later.evidence[0]!.data = { price: 999, currency: 'CNY' };
    later.inputFingerprint = 'c'.repeat(64);
    const second = await store.submit(owner, later, prepare);
    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.run).toEqual(first.run);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(first.run).toMatchObject({
      researchOwnerId: owner,
      researchSubmissionId: input.submissionId,
      researchScopeSnapshot: frozen.scopeSnapshot,
      modelMetadata: { frozenResearch: frozen },
    });
    expect(access.assertSubmission).toHaveBeenCalledTimes(2);
    expect(access.assertSnapshot).toHaveBeenCalledTimes(2);
  });

  it('相同标识异摘要冲突且不调用执行配置工厂', async () => {
    const { store, create } = stack();
    const owner = randomUUID();
    const { frozen, input } = submissionV2Fixture();
    await store.submit(owner, frozen, async () => submissionV2Execution());
    const prepare = vi.fn(async () => submissionV2Execution());
    frozen.request.question = '不同问题';
    await expect(store.submit(owner, frozen, prepare)).rejects.toThrow(
      '提交标识已用于其他研究输入',
    );
    await expect(store.find(owner, { ...input, mode: 'actual' })).rejects.toThrow(
      '提交标识已用于其他研究输入',
    );
    expect(prepare).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('先校验当前选择权限，再查询幂等身份', async () => {
    const { store, access, findUnique, create } = stack();
    const { input, frozen } = submissionV2Fixture();
    access.assertSubmission.mockRejectedValue(new ForbiddenException('无权访问当前范围'));
    await expect(store.find(randomUUID(), input)).rejects.toThrow('无权访问当前范围');
    await expect(
      store.submit(randomUUID(), frozen, async () => submissionV2Execution()),
    ).rejects.toThrow('无权访问当前范围');
    expect(findUnique).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('找回前核对原快照权限，撤销权限后不能返回已创建任务', async () => {
    const { store, access } = stack();
    const owner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    await store.submit(owner, frozen, async () => submissionV2Execution());
    access.assertSnapshot.mockRejectedValue(new ForbiddenException('原范围已不可访问'));
    await expect(store.find(owner, input)).rejects.toThrow('原范围已不可访问');
    await expect(store.submit(owner, frozen, async () => submissionV2Execution())).rejects.toThrow(
      '原范围已不可访问',
    );
  });

  it('另一身份持有同一提交标识不能找回他人任务，并可创建自己的提交', async () => {
    const { store, rows } = stack();
    const firstOwner = randomUUID(),
      otherOwner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    const first = await store.submit(firstOwner, frozen, async () => submissionV2Execution());
    expect(await store.find(otherOwner, input)).toBeNull();
    const other = await store.submit(otherOwner, frozen, async () => submissionV2Execution());
    expect(other.run.id).not.toBe(first.run.id);
    expect(rows.size).toBe(2);
  });

  it('不完整旧快照或错误执行版本均拒绝，V1 执行配置不能用于新 V2', async () => {
    const { store, rows, create } = stack();
    const owner = randomUUID();
    const { input, frozen } = submissionV2Fixture();
    const seed = submissionV2Execution();
    seed.sdkExecution.contract = { id: 'research', version: 'research-generation-v1' };
    await expect(store.submit(owner, frozen, async () => seed)).rejects.toThrow(
      '尚未执行的 V2 配置',
    );
    expect(create).not.toHaveBeenCalled();
    await store.submit(owner, frozen, async () => submissionV2Execution());
    rows.get(`${owner}:${input.submissionId}`)!.researchScopeSnapshot = null;
    await expect(store.find(owner, input)).rejects.toThrow('已保存的研究范围无效');
  });

  it('执行配置准备失败时不写入 AiRun', async () => {
    const { store, create } = stack();
    const { frozen } = submissionV2Fixture();
    await expect(
      store.submit(randomUUID(), frozen, async () => {
        throw new Error('配置已撤销');
      }),
    ).rejects.toThrow('配置已撤销');
    expect(create).not.toHaveBeenCalled();
  });
});
