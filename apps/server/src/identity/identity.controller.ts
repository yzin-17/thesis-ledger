import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { IdentityService, IDENTITY_SESSION_HEADER } from './identity.service.js';
import { localIdentityPrincipal } from './local-workspace.js';
import type { PrincipalRequest } from './identity-rate-limit-subject.js';

@Controller('identity')
export class IdentityController {
  constructor(private readonly identities: IdentityService) {}
  @Get('context')
  async context(@Headers(IDENTITY_SESSION_HEADER) token: string | undefined, @Req() request?: PrincipalRequest) {
    const local = localIdentityPrincipal();
    if (local) return { mode: 'local', principal: local };
    try {
      return {
        mode: 'account',
        principal: request?.identityPrincipal ?? (token ? await this.identities.requireSession(token) : null),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) return { mode: 'account', principal: null };
      throw error;
    }
  }
  @Post('users')
  register(@Body() input: unknown) {
    return this.identities.register(input);
  }
  @Post('sessions')
  @HttpCode(200)
  login(@Body() input: unknown) {
    return this.identities.login(input);
  }
  @Get('session')
  current(@Headers(IDENTITY_SESSION_HEADER) token: string | undefined, @Req() request?: PrincipalRequest) {
    // Local context is separate from the account-session endpoint.
    if (token && process.env.STRATEGY_IDENTITY_MODE === 'account' && request?.identityPrincipal)
      return request.identityPrincipal;
    return this.identities.requireSession(token);
  }
  @Post('session/revoke')
  @HttpCode(204)
  revoke(@Headers(IDENTITY_SESSION_HEADER) token: string | undefined) {
    return this.identities.revoke(token);
  }
}
