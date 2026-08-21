import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  startedAt: number;
  count: number;
}

export class ApiRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private consumeCount = 0;

  constructor(
    private readonly generalLimit = 120,
    private readonly heavyLimit = 20,
    private readonly windowMs = 60_000,
  ) {}

  private cleanupExpired(now: number) {
    this.consumeCount += 1;
    if (this.consumeCount % 256 !== 0 && this.buckets.size < 2048) return;
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
    }
  }

  consume(key: string, heavy = false, now = Date.now()) {
    this.cleanupExpired(now);
    const limit = heavy ? this.heavyLimit : this.generalLimit;
    const bucketKey = `${key}:${heavy ? 'heavy' : 'general'}`;
    const bucket = this.buckets.get(bucketKey);
    if (!bucket || now - bucket.startedAt >= this.windowMs) {
      this.buckets.set(bucketKey, { startedAt: now, count: 1 });
      return { allowed: true, retryAfterMs: 0 };
    }
    if (bucket.count >= limit)
      return {
        allowed: false,
        retryAfterMs: Math.max(0, this.windowMs - (now - bucket.startedAt)),
      };
    bucket.count += 1;
    return { allowed: true, retryAfterMs: 0 };
  }
}

const heavyPath = /\/(imports|ai|backtests|automations\/workflows)(?:\/|$)/u;

export const createApiRateLimitMiddleware =
  (limiter = new ApiRateLimiter()) =>
  (request: Request, response: Response, next: NextFunction) => {
    const key = request.ip || request.socket.remoteAddress || 'unknown';
    const result = limiter.consume(`${key}:${request.method}`, heavyPath.test(request.path));
    if (!result.allowed) {
      response
        .status(429)
        .setHeader('retry-after', Math.ceil(result.retryAfterMs / 1000))
        .json({ error: 'rate_limited', message: '请求过于频繁，请稍后重试' });
      return;
    }
    next();
  };
