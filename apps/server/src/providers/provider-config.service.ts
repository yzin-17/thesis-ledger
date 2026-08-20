import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { assertAllowedFeishuWebhookUrl } from '../notifications/feishu-webhook-security.js';
import {
  encryptProviderCredential,
  normalizeProviderCredential,
  type CredentialPayload,
} from '../platform/credential-security.js';
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
  | 'healthy'
  | 'degraded'
  | 'down'
  | 'disabled'
  | 'unconfigured'
  | 'untested';

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
  encryptedCredential: CredentialPayload;
  expiresAt: number;
  latencyMs: number;
  checkedAt: Date;
}

const DRAFT_TEST_TTL_MS = 5 * 60 * 1000;

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

const testFeishuWebhook = async (webhook: string) => {
  const url = assertAllowedFeishuWebhookUrl(webhook);
  const response = await fetch(url, {
    method: 'POST',
    redirect: 'error',
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
    // Feishu-compatible endpoints may return an empty successful body.
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
  private readonly draftCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
    let credentialPayload = tested?.encryptedCredential;
    const rawCredential = value.credentialsRef?.trim();
    if (!credentialPayload && rawCredential)
      credentialPayload = encryptProviderCredential(rawCredential);
    if (!credentialPayload && existing?.encryptedCredentials) {
      const normalized = normalizeProviderCredential(existing.encryptedCredentials);
      if (normalized.needsRotation) credentialPayload = normalized.payload;
    }

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
        ...(credentialPayload ? { encryptedCredentials: credentialPayload } : {}),
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
        ...(credentialPayload ? { encryptedCredentials: credentialPayload } : {}),
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
    const storedCredential = existing ? await this.readStoredCredential(existing) : '';
    const credential = value.credentialsRef?.trim() || storedCredential;
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
        credential: await this.readStoredCredential(config),
      },
      true,
    );
  }

  private async readStoredCredential(config: {
    name: string;
    encryptedCredentials?: Uint8Array | null;
  }) {
    if (!config.encryptedCredentials) return '';
    const normalized = normalizeProviderCredential(config.encryptedCredentials);
    if (normalized.needsRotation) {
      await this.prisma.providerConfig.update({
        where: { name: config.name },
        data: { encryptedCredentials: normalized.payload },
      });
    }
    return normalized.credential;
  }

  private consumeDraftTest(input: ProviderConfigInput) {
    if (!input.connectionTestToken) return undefined;
    const token = input.connectionTestToken;
    const record = this.draftTests.get(token);
    this.deleteDraftTest(token);
    return record && record.expiresAt > Date.now() && record.name === input.name
      ? record
      : undefined;
  }

  private storeDraftTest(token: string, record: DraftTestRecord) {
    this.deleteDraftTest(token);
    this.draftTests.set(token, record);
    const timer = setTimeout(() => this.deleteDraftTest(token), DRAFT_TEST_TTL_MS);
    timer.unref?.();
    this.draftCleanupTimers.set(token, timer);
  }

  private deleteDraftTest(token: string) {
    this.draftTests.delete(token);
    const timer = this.draftCleanupTimers.get(token);
    if (timer) clearTimeout(timer);
    this.draftCleanupTimers.delete(token);
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
    this.storeDraftTest(testToken, {
      name: input.name,
      encryptedCredential: encryptProviderCredential(input.credential),
      expiresAt: Date.now() + DRAFT_TEST_TTL_MS,
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
