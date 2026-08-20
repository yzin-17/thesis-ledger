import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export type ServerExposureMode = 'desktop-local' | 'lan';

export interface ServerNetworkSecurity {
  mode: ServerExposureMode;
  host: '127.0.0.1' | '0.0.0.0';
  apiToken?: string;
}

export const resolveServerNetworkSecurity = (
  environment: Record<string, string | undefined> = process.env,
): ServerNetworkSecurity => {
  const rawMode = environment.SERVER_EXPOSURE_MODE?.trim() || 'desktop-local';
  if (rawMode !== 'desktop-local' && rawMode !== 'lan')
    throw new Error('SERVER_EXPOSURE_MODE 只能是 desktop-local 或 lan');
  if (rawMode === 'desktop-local') return { mode: rawMode, host: '127.0.0.1' };

  const apiToken = environment.THESIS_LEDGER_API_TOKEN?.trim();
  if (!apiToken || apiToken.length < 16)
    throw new Error('LAN mode 必须配置至少 16 字符的 THESIS_LEDGER_API_TOKEN');
  return { mode: rawMode, host: '0.0.0.0', apiToken };
};

export const authorizedBearer = (authorization: string | undefined, expectedToken: string) => {
  if (!authorization?.startsWith('Bearer ')) return false;
  const actual = Buffer.from(authorization.slice('Bearer '.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const createLanAuthMiddleware = (apiToken: string) =>
  (request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'OPTIONS') {
      next();
      return;
    }
    if (authorizedBearer(request.header('authorization'), apiToken)) {
      next();
      return;
    }
    response.status(401).json({
      error: 'unauthorized',
      message: 'LAN API 需要有效 Bearer token',
    });
  };
