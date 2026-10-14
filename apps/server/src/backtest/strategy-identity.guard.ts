import {
  Injectable,
  Inject,
  createParamDecorator,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { IdentityService, IDENTITY_SESSION_HEADER } from '../identity/identity.service.js';
import { StrategyAccessService } from './strategy-access.service.js';
import { localIdentityPrincipal } from '../identity/local-workspace.js';

type StrategyRequest = Request & { strategyOwnerId?: string | null };
@Injectable()
export class StrategyIdentityGuard implements CanActivate {
  constructor(
    @Inject(IdentityService) private readonly identities: IdentityService,
    @Inject(StrategyAccessService) private readonly access: StrategyAccessService,
  ) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<StrategyRequest>();
    const token = request.header(IDENTITY_SESSION_HEADER);
    const local = localIdentityPrincipal();
    let owner: string | null = local?.id ?? null;
    if (!local && token) owner = (await this.identities.requireSession(token)).id;
    request.strategyOwnerId = owner;
    const id = request.params.id;
    if (typeof id === 'string' && request.path.includes('/strategies/'))
      await this.access.strategy(z.uuid().parse(id), owner);
    else if (typeof id === 'string' && request.path.includes('/runs/'))
      await this.access.run(z.uuid().parse(id), owner);
    const body: unknown = request.body;
    if (
      body &&
      typeof body === 'object' &&
      'strategyVersionId' in body &&
      typeof body.strategyVersionId === 'string'
    )
      await this.access.version(z.uuid().parse(body.strategyVersionId), owner);
    return true;
  }
}
export const CurrentStrategyOwner = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    context.switchToHttp().getRequest<StrategyRequest>().strategyOwnerId ?? null,
);
