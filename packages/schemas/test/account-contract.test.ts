import { describe, expect, it } from 'vitest';
import {
  accountPermanentDeletionErrorCodeSchema,
  accountResponseSchema,
  accountsResponseSchema,
} from '../src/portfolio.js';

const account = {
  id: '00000000-0000-4000-8000-000000000001',
  name: '证券账户',
  institution: null,
  type: 'securities',
  mode: 'shadow',
  currency: 'CNY',
  active: false,
};

describe('账户共享契约', () => {
  it('接受包含停用账户和模式的账户列表', () => {
    expect(accountsResponseSchema.parse([account])).toEqual([account]);
  });

  it('拒绝不完整或非法账户响应', () => {
    expect(accountResponseSchema.safeParse({ ...account, id: 'missing' }).success).toBe(false);
    expect(accountResponseSchema.safeParse({ ...account, mode: 'invalid' }).success).toBe(false);
    expect(accountResponseSchema.safeParse({ ...account, active: 'false' }).success).toBe(false);
  });

  it('固定永久删除业务冲突错误码', () => {
    expect(accountPermanentDeletionErrorCodeSchema.parse('ACCOUNT_IN_USE')).toBe('ACCOUNT_IN_USE');
    expect(accountPermanentDeletionErrorCodeSchema.safeParse('other').success).toBe(false);
  });
});
