import { createHash, randomBytes } from 'node:crypto';
import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { identityCredentialsSchema, identityRegistrationSchema, identityPrincipalSchema,
  identitySessionSchema, type IdentityPrincipal } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';
import { hashIdentityPassword, verifyIdentityPassword, missingIdentityPassword } from './identity-credentials.js';

const denied = () => new UnauthorizedException({ code: 'IDENTITY_UNAUTHORIZED', message: '请登录有效的用户会话' });
const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const IDENTITY_SESSION_HEADER = 'x-thesis-ledger-session';

@Injectable()
export class IdentityService {
  constructor(private readonly database: PrismaService) {}
  async register(raw: unknown) {
    const input = identityRegistrationSchema.parse(raw);
    const passwordHash = await hashIdentityPassword(input.password);
    let user;
    try {
      user = await this.database.identityUser.create({ data: { username: input.username,
        displayName: input.displayName, passwordHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
        throw new ConflictException({ code: 'IDENTITY_USERNAME_EXISTS', message: '用户名已使用' });
      throw error;
    }
    return this.issue(identityPrincipalSchema.parse({ id: user.id, username: user.username, displayName: user.displayName }));
  }
  async login(raw: unknown) {
    const input = identityCredentialsSchema.parse(raw);
    const user = await this.database.identityUser.findUnique({ where: { username: input.username } });
    const verified = await verifyIdentityPassword(input.password, user?.passwordHash ?? missingIdentityPassword);
    if (!user?.enabled || !verified) throw denied();
    return this.issue(identityPrincipalSchema.parse({ id: user.id, username: user.username, displayName: user.displayName }));
  }
  async requireSession(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) throw denied();
    const session = await this.database.identitySession.findUnique({ where: { tokenDigest: digest(token) }, include: { user: true } });
    if (!session || session.revokedAt !== null || session.expiresAt.getTime() <= Date.now() || !session.user.enabled)
      throw denied();
    return identityPrincipalSchema.parse({ id: session.user.id, username: session.user.username, displayName: session.user.displayName });
  }
  async revoke(token: string | undefined) {
    if (!token || !/^[A-Za-z0-9_-]{43}$/u.test(token)) return;
    await this.database.identitySession.updateMany({ where: { tokenDigest: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  private async issue(principal: IdentityPrincipal) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await this.database.identitySession.create({ data: { tokenDigest: digest(token), userId: principal.id, expiresAt } });
    return identitySessionSchema.parse({ token, expiresAt: expiresAt.toISOString(), principal });
  }
}
