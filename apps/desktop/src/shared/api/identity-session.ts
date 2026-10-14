import { identitySessionSchema, type IdentityPrincipal } from '@thesis-ledger/schemas';

type Session = { token: string; expiresAt: string; principal: IdentityPrincipal };
let session: Session | null = null;
const listeners = new Set<() => void>();
export const currentIdentitySession = () => session;
export const subscribeIdentitySession = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function setIdentitySession(raw: unknown) {
  session = raw === null ? null : identitySessionSchema.parse(raw);
  for (const listener of listeners) listener();
}
export function withIdentitySession(init?: RequestInit): RequestInit {
  const headers = new Headers(init?.headers);
  if (session) headers.set('x-thesis-ledger-session', session.token);
  return { ...init, headers };
}
