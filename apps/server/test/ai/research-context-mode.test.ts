import { expect, it, vi } from 'vitest';
import { ResearchScopePermissions } from '../../src/research/research-scope-permissions.js';
import { localIdentityPrincipal } from '../../src/identity/local-workspace.js';
import { submissionV2Fixture } from './research-submission-v2.fixture.js';

it.each(['actual', 'shadow'] as const)('研究提交按 %s 账户模式检查权限', async (mode) => {
  const { input } = submissionV2Fixture();
  const accountId = '91111111-1111-4111-8111-111111111111';
  const count = vi.fn().mockResolvedValueOnce(0).mockResolvedValueOnce(1);
  const transaction = { account: { count } };
  const permissions = new ResearchScopePermissions();
  const owner = localIdentityPrincipal()!.id;
  const request = { ...input, mode, scope: { scope: 'account' as const, accountId } };
  await expect(permissions.assertSubmission(transaction as never, owner, request))
    .rejects.toThrow('账户不存在或与提交模式不一致');
  await expect(permissions.assertSubmission(transaction as never, owner, request)).resolves.toBeUndefined();
  expect(count).toHaveBeenCalledTimes(2);
  expect(count).toHaveBeenCalledWith({ where: { id: accountId, mode } });
});
