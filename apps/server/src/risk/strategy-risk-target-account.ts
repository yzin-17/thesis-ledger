import { BadRequestException, NotFoundException } from '@nestjs/common';

type TargetAccount = { active: boolean; mode: string; type: string };

export function assertStrategyRiskTargetAccount(
  account: TargetAccount | null,
  symbol: string,
  executionSymbol: string,
) {
  if (!account) throw new NotFoundException('账户不存在');
  if (!account.active) throw new BadRequestException('账户已停用');
  if (account.mode !== 'actual' || account.type === 'cash')
    throw new BadRequestException('风险应用只支持启用的实际投资账户');
  if (executionSymbol !== symbol)
    throw new BadRequestException('风险应用标的必须与策略执行标的一致');
}
