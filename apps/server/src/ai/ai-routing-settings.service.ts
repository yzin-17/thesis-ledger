import { ConflictException, Injectable } from '@nestjs/common';
import type { AiResearchDefault } from '@thesis-ledger/schemas';
import { PrismaService } from '../platform/prisma.service.js';

const GLOBAL_ID = 'global';

@Injectable()
export class AiRoutingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async read() {
    const row = await this.prisma.aiRoutingSettings.findUnique({ where: { id: GLOBAL_ID } });
    return {
      researchDefault:
        row?.researchDefaultProvider && row.researchDefaultModel
          ? {
              providerId: row.researchDefaultProvider,
              model: row.researchDefaultModel,
            }
          : null,
      revision: String(row?.revision ?? 0),
    };
  }

  async update(input: { researchDefault: AiResearchDefault | null; expectedRevision: string }) {
    const current = await this.prisma.aiRoutingSettings.findUnique({
      where: { id: GLOBAL_ID },
    });
    const currentRevision = String(current?.revision ?? 0);
    if (input.expectedRevision !== currentRevision)
      throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');

    const nextRevision = (current?.revision ?? 0) + 1;
    const data = {
      researchDefaultProvider: input.researchDefault?.providerId ?? null,
      researchDefaultModel: input.researchDefault?.model ?? null,
      revision: nextRevision,
    };
    if (!current) {
      try {
        await this.prisma.aiRoutingSettings.create({
          data: { id: GLOBAL_ID, ...data },
        });
      } catch (error) {
        if (this.isUniqueConflict(error))
          throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
        throw error;
      }
    } else {
      const result = await this.prisma.aiRoutingSettings.updateMany({
        where: { id: GLOBAL_ID, revision: current.revision },
        data,
      });
      if (result.count !== 1) throw new ConflictException('AI 默认模型设置已变化，请刷新后重试');
    }
    return this.read();
  }

  private isUniqueConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }
}
