import { Prisma } from '@prisma/client';
import {
  arenaDecisionSchema,
  type ArenaBook,
  type ArenaProtocol,
  type MarketInstrumentFact,
} from '@thesis-ledger/schemas';
export function checkArenaDecision(
  raw: unknown,
  p: ArenaProtocol,
  book: ArenaBook,
  facts: MarketInstrumentFact[],
) {
  const decision = arenaDecisionSchema.parse(raw);
  const bySymbol = new Map(decision.actions.map((a) => [a.symbol, a]));
  if (bySymbol.size !== decision.actions.length || p.instruments.length !== bySymbol.size)
    throw Error('指令必须覆盖完整标的池且不重复');
  let reserved = new Prisma.Decimal(0);
  for (const instrument of p.instruments) {
    const action = bySymbol.get(instrument.symbol);
    if (!action || !action.references.every((ref) => facts.some((f) => f.ref === ref)))
      throw Error('标的或证据引用越界');
    const pos = book.positions.find((i) => i.symbol === action.symbol);
    if (action.action === 'observe' && pos) throw Error('已有仓位不能选择空仓观望');
    if (action.action === 'hold') {
      if (!pos) throw Error('没有仓位不能选择持有');
      reserved = reserved.plus(new Prisma.Decimal(pos.quantity).times(pos.close));
    } else if (action.action === 'target') {
      if (action.weightBps > p.maxPositionBps) throw Error('目标仓位超过赛制上限');
      if (!pos && action.weightBps === 0) throw Error('空仓应显式观望');
      reserved = reserved.plus(new Prisma.Decimal(book.nav).times(action.weightBps).div(10000));
    }
  }
  if (reserved.gt(book.nav)) throw Error('合计目标超出可用净值');
  return decision;
}
