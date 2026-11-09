import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { type IdentityService, IDENTITY_SESSION_HEADER } from './identity.service.js';
import { localIdentityPrincipal } from './local-workspace.js';

export type PrincipalRequest = Request & { identityPrincipal?: IdentityPrincipal };

export const identityRateLimitSubject = (identities: IdentityService) =>
  async (request: PrincipalRequest): Promise<string | undefined> => {
    const local = localIdentityPrincipal();
    if (local) { request.identityPrincipal = local; return local.id; }
    const token = request.header(IDENTITY_SESSION_HEADER);
    if (!token) return undefined;
    try {
      const principal = await identities.requireSession(token);
      request.identityPrincipal = principal;
      return principal.id;
    } catch (error) {
      if (error instanceof UnauthorizedException) return undefined;
      throw error;
    }
  };
