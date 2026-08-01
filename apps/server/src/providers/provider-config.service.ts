import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../platform/prisma.service.js';

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
}

const validate = (input: ProviderConfigInput) => {
  if (!input.name.trim()) throw new Error('Provider 名称不能为空');
  if (!Number.isInteger(input.priority) || input.priority < 0)
    throw new Error('Provider 优先级必须为非负整数');
  if (input.capabilities.length === 0) throw new Error('至少选择一项 Provider 能力');
  return input;
};

@Injectable()
export class ProviderConfigService {
  constructor(private readonly prisma: PrismaService) {}

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
    return this.prisma.providerConfig.upsert({
      where: { name: value.name },
      update: {
        type: value.type,
        enabled: value.enabled ?? true,
        priority: value.priority,
        capabilities: value.capabilities,
        ...(value.credentialsRef === undefined
          ? {}
          : { encryptedCredentials: Buffer.from(value.credentialsRef) }),
        settings: (value.settings ?? {}) as Prisma.InputJsonValue,
        ...(value.quota === undefined ? {} : { quota: value.quota }),
        ...(value.cost === undefined ? {} : { cost: value.cost }),
      },
      create: {
        name: value.name,
        type: value.type,
        enabled: value.enabled ?? true,
        priority: value.priority,
        capabilities: value.capabilities,
        ...(value.credentialsRef === undefined
          ? {}
          : { encryptedCredentials: Buffer.from(value.credentialsRef) }),
        settings: (value.settings ?? {}) as Prisma.InputJsonValue,
        ...(value.quota === undefined ? {} : { quota: value.quota }),
        ...(value.cost === undefined ? {} : { cost: value.cost }),
      },
    });
  }

  async test(name: string) {
    const config = await this.prisma.providerConfig.findUnique({ where: { name } });
    if (!config) throw new NotFoundException('Provider 配置不存在');
    return {
      name,
      status: config.enabled ? 'unknown' : 'disabled',
      message: config.enabled ? '等待 Provider Plugin 执行连通性测试' : 'Provider 已停用',
      credentialConfigured: Boolean(config.encryptedCredentials),
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
}
