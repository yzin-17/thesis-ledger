import { z } from 'zod';
import type { RedisService } from '../../platform/redis.service.js';
import { redisKey } from '../../platform/redis.service.js';
import {
  ADAPTIVE_RULE,
  type AdaptiveObservation,
  type AdaptiveObservationStore,
} from './ai-adaptive-policy.js';

const observationSchema = z.strictObject({
  actualModel: z.string().min(1).max(200).nullable().optional(),
  requestId: z.string().min(1).max(120),
  at: z.number().finite().nonnegative(),
  firstMs: z.number().finite().nonnegative().nullable(),
  maxGapMs: z.number().finite().nonnegative().nullable(),
  firstCensored: z.boolean(),
  gapCensored: z.boolean(),
  firstLowerBoundMs: z.number().finite().nonnegative().optional(),
  gapLowerBoundMs: z.number().finite().nonnegative().optional(),
  completionMs: z.number().finite().nonnegative().nullable().optional(),
  completionCensored: z.boolean().optional(),
  completionLowerBoundMs: z.number().finite().nonnegative().optional(),
  toolMs: z.number().finite().nonnegative().nullable().optional(),
  toolCensored: z.boolean().optional(),
  outcome: z.enum(['success', 'rejected', 'invalid', 'unknown']),
});
const stateSchema = z.strictObject({
  observations: z.array(observationSchema).max(ADAPTIVE_RULE.maxObservations),
  credit: z.number().int().min(0).max(1),
  granted: z.array(z.string().max(120)).max(ADAPTIVE_RULE.maxObservations),
});
type State = z.infer<typeof stateSchema>;
const emptyState = (): State => ({ observations: [], credit: 1, granted: [] });

/** 进程内适配器供显式实例化及离线测试使用；Nest 运行时注入共享 Redis 适配器。 */
export class MemoryAdaptiveObservationStore implements AdaptiveObservationStore {
  private readonly profiles = new Map<string, { at: number; state: State }>();
  constructor(private readonly now = Date.now) {}
  private state(profile: string) {
    const previous = this.profiles.get(profile);
    if (previous && this.now() - previous.at < ADAPTIVE_RULE.windowMs) return previous;
    this.profiles.delete(profile);
    if (this.profiles.size >= ADAPTIVE_RULE.maxProfiles)
      this.profiles.delete(this.profiles.keys().next().value!);
    const created = { at: this.now(), state: emptyState() };
    this.profiles.set(profile, created);
    return created;
  }
  read(profile: string) {
    const value = this.state(profile);
    return Promise.resolve({
      available: true,
      observations: structuredClone(
        value.state.observations.filter(
          (item) => item.at <= this.now() && item.at >= this.now() - ADAPTIVE_RULE.windowMs,
        ),
      ),
    });
  }
  record(profile: string, observation: AdaptiveObservation) {
    const parsed = observationSchema.safeParse(observation);
    if (!parsed.success) return Promise.resolve();
    const value = this.state(profile);
    if (value.state.observations.some((item) => item.requestId === observation.requestId))
      return Promise.resolve();
    value.at = this.now();
    value.state.observations = [
      parsed.data,
      ...value.state.observations.filter((item) => item.at >= this.now() - ADAPTIVE_RULE.windowMs),
    ].slice(0, ADAPTIVE_RULE.maxObservations);
    if (observation.outcome === 'success') value.state.credit = 1;
    return Promise.resolve();
  }
  takeRetry(profile: string, requestId: string) {
    const value = this.state(profile);
    if (value.state.credit === 0 || value.state.granted.includes(requestId))
      return Promise.resolve(false);
    value.at = this.now();
    value.state.credit = 0;
    value.state.granted = [requestId, ...value.state.granted].slice(
      0,
      ADAPTIVE_RULE.maxObservations,
    );
    return Promise.resolve(true);
  }
}

// 观测去重、配额领取与全局容量收敛放在同一原子命令，不能用GET后SET替代。
export const ADAPTIVE_HISTORY_MUTATION = `
local raw = redis.call('GET', KEYS[1])
local s = raw and cjson.decode(raw) or {observations={}, credit=1, granted={}}
if type(s) ~= 'table' or type(s.observations) ~= 'table' or type(s.granted) ~= 'table' or (s.credit ~= 0 and s.credit ~= 1) then return 0 end
local operation = ARGV[1]
local changed = 0
if operation == 'record' then
  local observation = cjson.decode(ARGV[2])
  for _, item in ipairs(s.observations) do
    if item.requestId == observation.requestId then return 0 end
  end
  table.insert(s.observations, 1, observation)
  for i = #s.observations, 1, -1 do
    if s.observations[i].at < tonumber(ARGV[3]) - tonumber(ARGV[4]) then table.remove(s.observations, i) end
  end
  while #s.observations > tonumber(ARGV[5]) do table.remove(s.observations) end
  if observation.outcome == 'success' then s.credit = 1 end
  changed = 1
elseif operation == 'retry' then
  if s.credit == 0 then return 0 end
  for _, request in ipairs(s.granted) do if request == ARGV[2] then return 0 end end
  s.credit = 0
  table.insert(s.granted, 1, ARGV[2])
  while #s.granted > tonumber(ARGV[5]) do table.remove(s.granted) end
  changed = 1
end
local observations = #s.observations == 0 and '[]' or cjson.encode(s.observations)
local granted = #s.granted == 0 and '[]' or cjson.encode(s.granted)
local encoded = '{"observations":' .. observations .. ',"credit":' .. s.credit .. ',"granted":' .. granted .. '}'
redis.call('SET', KEYS[1], encoded, 'PX', ARGV[4])
redis.call('ZADD', KEYS[2], ARGV[3], KEYS[1])
redis.call('PEXPIRE', KEYS[2], ARGV[4])
local overflow = redis.call('ZCARD', KEYS[2]) - tonumber(ARGV[6])
if overflow > 0 then
  local old = redis.call('ZRANGE', KEYS[2], 0, overflow - 1)
  for _, key in ipairs(old) do redis.call('DEL', key); redis.call('ZREM', KEYS[2], key) end
end
return changed
`;

type Client = Pick<RedisService['client'], 'get' | 'eval'>;
export class RedisAdaptiveObservationStore implements AdaptiveObservationStore {
  constructor(private readonly client: Client) {}
  private key(profile: string) {
    if (!/^[a-f0-9]{64}$/u.test(profile)) throw new Error('自适应profile必须是摘要');
    return redisKey('cache', `ai-adaptive:v2:${profile}`);
  }
  private async bounded<T>(work: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        work,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('自适应运行缓存不可用')), 500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  async read(profile: string) {
    try {
      const raw = await this.bounded(this.client.get(this.key(profile)));
      if (raw === null) return { available: true, observations: [] };
      if (Buffer.byteLength(raw) > 512 * 1024) throw new Error('运行缓存超限');
      const state = stateSchema.parse(JSON.parse(raw));
      return {
        available: true,
        observations: state.observations.filter(
          (item) => item.at <= Date.now() && item.at >= Date.now() - ADAPTIVE_RULE.windowMs,
        ),
      };
    } catch {
      return { available: false, observations: [] };
    }
  }
  private async mutate(profile: string, operation: string, value: string) {
    try {
      return (
        (await this.bounded(
          this.client.eval(
            ADAPTIVE_HISTORY_MUTATION,
            2,
            this.key(profile),
            redisKey('cache', 'ai-adaptive:v2:profiles'),
            operation,
            value,
            String(Date.now()),
            String(ADAPTIVE_RULE.windowMs),
            String(ADAPTIVE_RULE.maxObservations),
            String(ADAPTIVE_RULE.maxProfiles),
          ),
        )) === 1
      );
    } catch {
      return false;
    }
  }
  async record(profile: string, observation: AdaptiveObservation) {
    const parsed = observationSchema.safeParse(observation);
    if (parsed.success) await this.mutate(profile, 'record', JSON.stringify(parsed.data));
  }
  takeRetry(profile: string, requestId: string) {
    if (requestId.length === 0 || requestId.length > 120) return Promise.resolve(false);
    return this.mutate(profile, 'retry', requestId);
  }
}
