import { BadRequestException } from '@nestjs/common';

export const researchV2WritesEnabled = () => process.env.AI_RESEARCH_V2_WRITES_ENABLED === 'true';
export function assertResearchV2WritesEnabled() {
  if (!researchV2WritesEnabled())
    throw new BadRequestException({
      code: 'RESEARCH_V2_WRITES_DISABLED',
      message: 'V2 研究提交尚未启用，已有任务和报告继续按保存版本读取',
    });
}
