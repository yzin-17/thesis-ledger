import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import type { MarketPeriodCalendarFact } from '@thesis-ledger/domain';
import {
  arenaProtocolSchema,
  arenaCanTransition,
  arenaStateSchema,
  type ArenaCalendarQuery,
  type ArenaProtocol,
} from '@thesis-ledger/schemas';
import { MarketPeriodCalendarReader } from '../market/market-period-calendar-reader.js';
import { PrismaService } from '../platform/prisma.service.js';
import { lockArena, ModelArenaRepository } from './model-arena.repository.js';

export function arenaSessions(
  protocol: ArenaProtocol,
  calendar: MarketPeriodCalendarFact,
  now: Date,
) {
  if (
    protocol.calendarId !== calendar.market ||
    calendar.revision !== protocol.calendarVersion ||
    calendar.market !== protocol.market ||
    calendar.timezone !== protocol.timeZone ||
    calendar.coverageStart > protocol.startsOn ||
    calendar.coverageEnd <= protocol.endsOn
  )
    throw new BadRequestException('交易日历与冻结赛制不一致');
  const days = new Map<string, { open: number; close: number }>();
  for (const s of calendar.sessions) {
    const previous = days.get(s.tradingDate);
    days.set(s.tradingDate, {
      open: Math.min(previous?.open ?? Infinity, Date.parse(s.startAt)),
      close: Math.max(previous?.close ?? 0, Date.parse(s.endAt)),
    });
  }
  const sequence = [...days].sort(([a], [b]) => a.localeCompare(b));
  return sequence.flatMap(([day, session], i) => {
    if (day < protocol.startsOn || day > protocol.endsOn || session.close <= now.getTime())
      return [];
    const next = sequence[i + 1]?.[1];
    if (!next || next.open <= session.close)
      throw new BadRequestException('缺少下一交易日开盘证据');
    return [
      {
        tradingDate: day,
        dueAt: new Date(session.close),
        nextOpenAt: new Date(next.open),
        deadlineAt: new Date(
          Math.min(next.open, session.close + protocol.decisionDeadlineMinutes * 60000),
        ),
        calendarRevision: calendar.revision,
        maxAttempts: protocol.maxInfrastructureAttempts,
      },
    ];
  });
}
@Injectable()
export class ArenaSchedule {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(ModelArenaRepository) private readonly arenas: ModelArenaRepository,
    @Inject(MarketPeriodCalendarReader) private readonly calendars: MarketPeriodCalendarReader,
  ) {}
  private async calendar(p: ArenaCalendarQuery, now: Date) {
    const effective = now.toISOString().slice(0, 10);
    const end = new Date(Date.parse(p.endsOn + 'T00:00:00Z') + 14 * 86400000)
      .toISOString()
      .slice(0, 10);
    const result = await this.calendars.read({
      market: p.market,
      start: p.startsOn < effective ? p.startsOn : effective,
      end,
      evaluationAsOf: now.toISOString(),
    });
    if (result.status !== 'ready') throw new BadRequestException('无法取得完整的比赛交易日历');
    return result.calendar;
  }
  async preview(p: ArenaCalendarQuery) {
    const c = await this.calendar(p, new Date());
    return { calendarId: c.market, calendarVersion: c.revision, timeZone: c.timezone };
  }
  async start(owner: string, id: string, now = new Date()) {
    const arena = await this.arenas.read(owner, id);
    const p = arenaProtocolSchema.parse(arena.protocol);
    if (!arenaCanTransition(arenaStateSchema.parse(arena.state), 'running'))
      throw new ConflictException('当前比赛不能启动');
    const calendar = await this.calendar(p, now);
    const slots = arenaSessions(p, calendar, now);
    if (!slots.length) throw new BadRequestException('本赛期没有剩余的收盘轮次');
    return this.db.$transaction(async (tx) => {
      const row = await lockArena(tx, id, owner);
      if (row.state !== arena.state) throw new ConflictException('比赛状态已变化');
      if (row.state === 'paused')
        await tx.arenaOccurrence.updateMany({
          where: { arenaId: id, state: 'scheduled', dueAt: { lte: now } },
          data: { state: 'skipped', reason: 'arena_paused' },
        });
      await tx.arenaOccurrence.createMany({
        data: slots.map((s) => ({ ...s, arenaId: id })),
        skipDuplicates: true,
      });
      return tx.modelArena.update({
        where: { id },
        data: { state: 'running', startedAt: row.startedAt ?? now },
        select: { id: true, state: true },
      });
    });
  }
}
