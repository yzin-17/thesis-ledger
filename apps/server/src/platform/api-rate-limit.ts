import type { NextFunction, Request, Response } from 'express';
import { apiCostBudgets, apiRateLimitPolicy } from './api-rate-limit-policy.js';

interface Bucket { startedAt: number; count: number }
interface Quota { key: string; limit: number }
type LimitResult = { allowed: boolean; retryAfterMs: number };

export class ApiRateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private consumeCount = 0;
  private nextCapacitySweepAt = 0;

  constructor(private readonly windowMs = 60_000, private readonly maxBuckets = 50_000) {}

  private cleanupExpired(now: number) {
    for (const [key, bucket] of this.buckets) {
      if (now - bucket.startedAt >= this.windowMs) this.buckets.delete(key);
    }
  }

  consume(quotas: readonly Quota[], now = Date.now()): LimitResult {
    this.consumeCount += 1;
    if (this.consumeCount % 256 === 0) this.cleanupExpired(now);
    let retryAfterMs = 0;
    let newBuckets = 0;
    for (const { key, limit } of quotas) {
      const bucket = this.buckets.get(key);
      if (!bucket) newBuckets += 1;
      if (bucket && now - bucket.startedAt < this.windowMs && bucket.count >= limit)
        retryAfterMs = Math.max(retryAfterMs, this.windowMs - (now - bucket.startedAt));
    }
    if (retryAfterMs > 0) return { allowed: false, retryAfterMs };
    if (this.buckets.size + newBuckets > this.maxBuckets && now >= this.nextCapacitySweepAt) {
      this.cleanupExpired(now);
      newBuckets = quotas.filter(({ key }) => !this.buckets.has(key)).length;
      this.nextCapacitySweepAt = now + 1000;
    }
    if (this.buckets.size + newBuckets > this.maxBuckets)
      return { allowed: false, retryAfterMs: Math.max(1, this.nextCapacitySweepAt - now) };
    for (const { key } of quotas) {
      const bucket = this.buckets.get(key);
      if (!bucket || now - bucket.startedAt >= this.windowMs)
        this.buckets.set(key, { startedAt: now, count: 1 });
      else bucket.count += 1;
    }
    return { allowed: true, retryAfterMs: 0 };
  }
}

interface ApiRateLimitOptions {
  limiter?: ApiRateLimiter;
  resolveSubject?: (request: Request) => Promise<string | undefined>;
}

function reject(response: Response, result: LimitResult, policy: string) {
  response.locals.apiRateLimitPolicy = policy;
  response.status(429)
    .setHeader('retry-after', Math.max(1, Math.ceil(result.retryAfterMs / 1000)))
    .json({ error: 'rate_limited', message: '请求过于频繁，请稍后重试' });
}

export function createApiRateLimitMiddleware({
  limiter = new ApiRateLimiter(),
  resolveSubject,
}: ApiRateLimitOptions = {}) {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (request.method === 'OPTIONS') { next(); return; }
    const ip = request.ip || request.socket.remoteAddress || 'unknown';
    const policy = apiRateLimitPolicy(request.method, request.path);
    const cost = policy?.cost ?? 'read';
    // Health probes have a separate budget so application traffic cannot starve them.
    if (cost !== 'monitor') {
      const network = limiter.consume([{ key: `network:${ip}`, limit: 12_000 }]);
      if (!network.allowed) { reject(response, network, 'network'); return; }
    }
    let subject = `ip:${ip}`;
    try {
      if (policy && cost !== 'auth' && cost !== 'monitor' && resolveSubject) {
        const verified = await resolveSubject(request);
        if (verified) subject = `user:${verified}`;
      }
    } catch {
      response.locals.apiRateLimitPolicy = 'identity-unavailable';
      response.status(503).json({ error: 'identity_unavailable', message: '暂时无法验证工作区，请稍后重试' });
      return;
    }
    const budget = apiCostBudgets[cost];
    const operation = policy?.operation ?? 'unregistered';
    const result = limiter.consume([
      { key: `${subject}:operation:${operation}`, limit: budget.operation },
      { key: `${subject}:cost:${cost}`, limit: budget.total },
    ]);
    if (!result.allowed) { reject(response, result, cost); return; }
    next();
  };
}
