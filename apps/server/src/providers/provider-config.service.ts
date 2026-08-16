import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';
import {
  ProviderHealthService,
  type ProviderHealthSource,
  type ProviderState,
} from './provider-health.service.js';

export interface ProviderConfigInput {
  name: string;
  type: string;
  enabled?: boolean;
  priority: number;
  capabilities: string[];
  credentialsRef?: string;
  settings?: Record<string, unknown>;
  quota?: { limit?: number; used?: number; resetsAt?: string };
  cost?: { currency: string; amount: number; period: 'request' | 'month' | 'year' };
  connectionTestToken?: string;
}

export type ProviderConnectionTestStatus =
  'healthy' | 'degraded' | 'down' | 'disabled' | 'unconfigured' | 'untested';

export interface ProviderConnectionTestResult {
  name: string;
  status: ProviderConnectionTestStatus;
  message: string;
  credentialConfigured: boolean;
  testToken?: string;
  healthCheck?: ProviderHealthObservation;
}

export interface ProviderHealthObservation {
  provider: string;
  state: ProviderState;
  latencyMs: number | null;
  checkedAt: string;
  source: ProviderHealthSource;
}

interface DraftTestRecord {
  name: string;
  credential: string;
  expiresAt: number;
  latencyMs: number;
  checkedAt: Date;
}

const validate = (input: ProviderConfigInput) => {
  if (!input.name.trim()) throw new Error('Provider 名称不能为空');
  if (!Number.isInteger(input.priority) || input.priority < 0)
    throw new Error('Provider 优先级必须为非负整数');
  if (input.capabilities.length === 0) throw new Error('至少选择一项 Provider 能力');
  return input;
};

const isFeishuProvider = (name: string, type: string) => {
  const normalizedName = name
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-');
  return (
    type === 'notification' &&
    ['feishu', 'feishu-webhook', 'lark', 'lark-webhook'].includes(normalizedName)
  );
};

const readStoredCredential = (value?: Uint8Array | null) =>
  value ? Buffer.from(value).toString('utf8') : '';

const testFeishuWebhook = async (webhook: string) => {
  let url: URL;
  try {
    url = new URL(webhook);
  } catch {
    throw new Error('Webhook 地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new Error('Webhook 地址必须使用 HTTP 或 HTTPS');

  const response = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      msg_type: 'text',
      content: { text: 'ThesisLedger 连接测试' },
    }),
  });
  const responseBody = (await response.text()).slice(0, 500);
  if (!response.ok) throw new Error(`连接异常（HTTP ${response.status}）`);

  let payload: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(responseBody) as unknown;
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    // Some compatible webhook endpoints return an empty or plain-text 2xx response.
  }
  const code = payload?.code ?? payload?.StatusCode;
  if (code !== undefined && Number(code) !== 0) {
    const responseMessage = payload?.msg ?? payload?.StatusMessage;
    const detail =
      typeof responseMessage === 'string' || typeof responseMessage === 'number'
        ? String(responseMessage).slice(0, 120)
        : 'Webhook 返回错误';
    throw new Error(`连接异常：${detail}`);
  }
};

@Injectable()
export class ProviderConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providerHealth: ProviderHealthService,
  ) {}

  private readonly draftTests = new Map<string, DraftTestRecord>();

  list() {
    return this.prisma.providerConfig
      .findMany({ orderBy: [{ priority: 'asc' }, { name: 'asc' }] })
      .then((configs) =>
        configs.map(({ encryptedCredentials, ...config }) => ({
          ...config,
          credentialConfigured: Boolean(encryptedCredentials),
        })),
      );
  }

  async save(input: ProviderConfigInput) {
    const value = validate(input);
    const existing = await this.prisma.providerConfig.findUnique({ where: { name: value.name } });
    const tested = this.consumeDraftTest(value);
    const credential = tested?.credential ?? value.credentialsRef?.trim();
    const testedHealthy = Boolean(tested);
    const enabled = value.enabled ?? true;
    const healthReset = existing && existing.enabled !== enabled;
    const saved = await this.prisma.providerConfig.upsert({
      where: { name: value.name },
      update: {
        type: value.type,
        enabled,
        priority: value.priority,
        capabilities: value.capabilities,
        ...(credential ? { encryptedCredentials: Buffer.from(credential) } : {}),
        settings: (value.settings ?? {}) as Prisma.InputJsonValue,
        ...(value.quota === undefined ? {} : { quota: value.quota }),
        ...(value.cost === undefined ? {} : { cost: value.cost }),
        ...(testedHealthy ? { health: 'healthy' } : healthReset ? { health: 'unknown' } : {}),
      },
      create: {
        name: value.name,
        type: value.type,
        enabled,
        priority: value.priority,
        capabilities: value.capabilities,
        ...(credential ? { encryptedCredentials: Buffer.from(credential) } : {}),
        settings: (value.settings ?? {}) as Prisma.InputJsonValue,
        ...(value.quota === undefined ? {} : { quota: value.quota }),
        ...(value.cost === undefined ? {} : { cost: value.cost }),
        ...(testedHealthy ? { health: 'healthy' } : {}),
      },
    });
    let finalSaved = saved;
    let healthCheck: ProviderHealthObservation | undefined;
    if (tested) {
      const health = await this.providerHealth.record(
        value.name,
        true,
        tested.latencyMs,
        undefined,
        tested.checkedAt,
        'manual',
      );
      healthCheck = this.toHealthObservation(health, 'manual');
      if (health.state !== saved.health) {
        finalSaved = await this.prisma.providerConfig.update({
          where: { name: value.name },
          data: { health: health.state },
        });
      }
    }
    const { encryptedCredentials, ...config } = finalSaved;
    return {
      ...config,
      credentialConfigured: Boolean(encryptedCredentials),
      ...(healthCheck ? { healthCheck } : {}),
    };
  }

  async testDraft(input: ProviderConfigInput): Promise<ProviderConnectionTestResult> {
    const value = validate(input);
    const existing = await this.prisma.providerConfig.findUnique({
      where: { name: value.name },
    });
    const credential =
      value.credentialsRef?.trim() || readStoredCredential(existing?.encryptedCredentials);
    return this.runConnectionTest(
      {
        name: value.name,
        type: value.type,
        enabled: value.enabled ?? existing?.enabled ?? true,
        credential,
      },
      false,
    );
  }

  async test(name: string) {
    const config = await this.prisma.providerConfig.findUnique({ where: { name } });
    if (!config) throw new NotFoundException('Provider 配置不存在');
    return this.runConnectionTest(
      {
        name: config.name,
        type: config.type,
        enabled: config.enabled,
        credential: readStoredCredential(config.encryptedCredentials),
      },
      true,
    );
  }

  private consumeDraftTest(input: ProviderConfigInput) {
    if (!input.connectionTestToken) return undefined;
    const record = this.draftTests.get(input.connectionTestToken);
    this.draftTests.delete(input.connectionTestToken);
    return record && record.expiresAt > Date.now() && record.name === input.name
      ? record
      : undefined;
  }

  private async runConnectionTest(
    input: { name: string; type: string; enabled: boolean; credential: string },
    persistHealth: boolean,
  ): Promise<ProviderConnectionTestResult> {
    const credentialConfigured = Boolean(input.credential);
    if (!input.enabled)
      return {
        name: input.name,
        status: 'disabled',
        message: 'Provider 已停用',
        credentialConfigured,
      };
    if (!credentialConfigured)
      return {
        name: input.name,
        status: 'unconfigured',
        message: '请先配置凭证，再测试连接',
        credentialConfigured: false,
      };
    if (!isFeishuProvider(input.name, input.type))
      return {
        name: input.name,
        status: 'untested',
        message: '当前 Provider 尚未接入连接测试插件',
        credentialConfigured: true,
      };

    const started = Date.now();
    try {
      await testFeishuWebhook(input.credential);
    } catch (error) {
      const checkedAt = new Date();
      const latencyMs = Date.now() - started;
      let healthCheck: ProviderHealthObservation | undefined;
      if (persistHealth) {
        const errorCode = error instanceof Error ? error.name : 'provider_error';
        const health = await this.providerHealth.record(
          input.name,
          false,
          latencyMs,
          errorCode,
          checkedAt,
          'manual',
        );
        await this.prisma.providerConfig.update({
          where: { name: input.name },
          data: { health: health.state },
        });
        healthCheck = this.toHealthObservation(health, 'manual');
      }
      return {
        name: input.name,
        status: 'down',
        message: error instanceof Error ? error.message : '连接异常',
        credentialConfigured: true,
        ...(healthCheck ? { healthCheck } : {}),
      };
    }

    const latencyMs = Date.now() - started;
    if (persistHealth) {
      const checkedAt = new Date();
      const health = await this.providerHealth.record(
        input.name,
        true,
        latencyMs,
        undefined,
        checkedAt,
        'manual',
      );
      await this.prisma.providerConfig.update({
        where: { name: input.name },
        data: { health: health.state },
      });
      return {
        name: input.name,
        status: 'healthy',
        message: '测试成功',
        credentialConfigured: true,
        healthCheck: this.toHealthObservation(health, 'manual'),
      };
    }

    const testToken = randomUUID();
    this.draftTests.set(testToken, {
      name: input.name,
      credential: input.credential,
      expiresAt: Date.now() + 5 * 60 * 1000,
      latencyMs,
      checkedAt: new Date(),
    });
    return {
      name: input.name,
      status: 'healthy',
      message: '测试成功',
      credentialConfigured: true,
      testToken,
    };
  }

  async usage(name: string) {
    const config = await this.prisma.providerConfig.findUnique({ where: { name } });
    if (!config) throw new NotFoundException('Provider 配置不存在');
    const quota = (config.quota ?? {}) as { limit?: number; used?: number; resetsAt?: string };
    const limit = quota.limit;
    const used = quota.used ?? 0;
    return {
      name,
      used,
      limit: limit ?? null,
      remaining: limit === undefined ? null : Math.max(0, limit - used),
      state:
        limit === undefined
          ? 'unknown'
          : used >= limit
            ? 'exhausted'
            : used / limit >= 0.9
              ? 'warning'
              : 'ok',
      resetsAt: quota.resetsAt ?? null,
    };
  }

  private toHealthObservation(
    health: { provider: string; state: string; latencyMs: number | null; checkedAt: Date },
    source: ProviderHealthSource,
  ): ProviderHealthObservation {
    return {
      provider: health.provider,
      state: health.state as ProviderState,
      latencyMs: health.latencyMs,
      checkedAt: health.checkedAt.toISOString(),
      source,
    };
  }
}
