import { describe, expect, it, vi } from 'vitest';
import { AuthoringDraftRepository } from '../../src/strategy-authoring/authoring-draft.repository.js';
import type { AuthoringDatabase } from '../../src/strategy-authoring/authoring-store.js';

const content = {
  title: '未完成草稿',
  description: '缺少仓位',
  questions: [],
  requirements: [],
  runtimeIntents: [],
  removedRequirements: [],
  definitionText: '{',
  manualChanges: [],
};
const fixture = () => {
  const query = vi.fn().mockResolvedValue([]);
  const execute = vi.fn().mockResolvedValue(1);
  const transaction = vi.fn(async (work) => work({ $queryRaw: query, $executeRaw: execute }));
  const repository = new AuthoringDraftRepository({
    $transaction: transaction,
  } as unknown as AuthoringDatabase);
  return { repository, query, execute, transaction };
};
const id = '11111111-1111-4111-8111-111111111111';
describe('编写草稿 repository 前置约束', () => {
  it('没有可信 owner 或客户端提交校验结论时不进入数据库', async () => {
    const f = fixture();
    await expect(async () => f.repository.create('', content)).rejects.toThrow();
    await expect(async () =>
      f.repository.create('alice', { ...content, validation: 'valid' }),
    ).rejects.toThrow();
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it('不可访问记录不透露他人修订', async () => {
    const f = fixture();
    await expect(f.repository.read('bob', id)).rejects.toMatchObject({
      response: { code: 'AUTHORING_NOT_FOUND' },
    });
    await expect(
      f.repository.update('bob', id, { expectedRevision: 1, content }),
    ).rejects.toMatchObject({ response: { code: 'AUTHORING_NOT_FOUND' } });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('已保存、丢弃及旧修订都阻止写入', async () => {
    const f = fixture();
    for (const state of ['saved', 'discarded']) {
      f.query.mockResolvedValue([{ id, state, revision: 2 }]);
      await expect(
        f.repository.update('alice', id, { expectedRevision: 2, content }),
      ).rejects.toMatchObject({ response: { code: 'AUTHORING_CLOSED' } });
    }
    f.query.mockResolvedValue([{ id, state: 'editing', revision: 2 }]);
    await expect(
      f.repository.update('alice', id, { expectedRevision: 1, content }),
    ).rejects.toMatchObject({
      response: { code: 'AUTHORING_REVISION_CONFLICT', currentRevision: 2 },
    });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('持久化不完整原文并派生 invalid，不能冒充已审核', async () => {
    const f = fixture();
    f.query.mockResolvedValue([{ id, revision: 1, state: 'editing', content }]);
    await f.repository.create('alice', content);
    const inserts = f.execute.mock.calls.map(([sql]) => sql.values).flat();
    expect(inserts).toContain(JSON.stringify(content));
    expect(inserts).toContainEqual(expect.stringContaining('"status":"invalid"'));
  });
});
