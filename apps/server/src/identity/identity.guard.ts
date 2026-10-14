import {
  createParamDecorator,
  ExecutionContext,
  Injectable,
  type CanActivate,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { IdentityPrincipal } from '@thesis-ledger/schemas';
import { IdentityService, IDENTITY_SESSION_HEADER } from './identity.service.js';
import { localIdentityPrincipal } from './local-workspace.js';

type PrincipalRequest = Request & { identityPrincipal?: IdentityPrincipal };
@Injectable()
export class IdentityGuard implements CanActivate {
  constructor(private readonly identities: IdentityService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<PrincipalRequest>();
    request.identityPrincipal =
      localIdentityPrincipal() ??
      (await this.identities.requireSession(request.header(IDENTITY_SESSION_HEADER)));
    return true;
  }
}
export const CurrentIdentity = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const principal = context.switchToHttp().getRequest<PrincipalRequest>().identityPrincipal;
  if (!principal) throw new UnauthorizedException('缺少已验证用户身份');
  return principal;
});
