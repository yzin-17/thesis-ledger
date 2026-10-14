import type { IdentityPrincipal } from '@thesis-ledger/schemas';

const principal: IdentityPrincipal = {
  id: '4cb546a5-b04f-4c0a-9d3b-6a53fdb74f57',
  username: 'local-workspace',
  displayName: '本地工作区',
};

export function localIdentityPrincipal(): IdentityPrincipal | null {
  if (process.env.STRATEGY_IDENTITY_MODE === 'account') return null;
  return { ...principal };
}
