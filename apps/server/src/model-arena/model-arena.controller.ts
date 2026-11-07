import { ArenaComparisons } from './arena-comparison.js';
import { ArenaRoundReports } from './arena-round-report.js';
import { ArenaSchedule } from './arena-schedule.js';
import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Query,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  arenaCalendarQuerySchema,
  arenaDetailSchema,
  arenaPeriodSchema,
  arenaPointQuerySchema,
  arenaSummarySchema,
  type IdentityPrincipal,
} from '@thesis-ledger/schemas';
import { CurrentIdentity, IdentityGuard } from '../identity/identity.guard.js';
import { ModelArenaRepository } from './model-arena.repository.js';

@Controller('model-arenas')
@UseGuards(IdentityGuard)
export class ModelArenaController {
  constructor(
    @Inject(ArenaComparisons) private readonly comparison: ArenaComparisons,
    @Inject(ArenaRoundReports) private readonly reports: ArenaRoundReports,
    @Inject(ModelArenaRepository) private readonly arenas: ModelArenaRepository,
    @Inject(ArenaSchedule) private readonly schedule: ArenaSchedule,
  ) {}
  @Post()
  create(@CurrentIdentity() principal: IdentityPrincipal, @Body() input: unknown) {
    return this.arenas.create(principal.id, input);
  }
  @Post(':id/start')
  start(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.schedule.start(principal.id, id);
  }
  @Post(':id/pause')
  pause(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.arenas.transition(principal.id, id, 'paused');
  }
  @Post(':id/end')
  end(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.arenas.transition(principal.id, id, 'ended');
  }
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentIdentity() principal: IdentityPrincipal) {
    const rows = await this.arenas.list(principal.id);
    return rows.map((row) =>
      arenaSummarySchema.parse({ ...row, createdAt: row.createdAt.toISOString() }),
    );
  }
  @Get('calendar')
  calendar(@Query() input: unknown) {
    return this.schedule.preview(arenaCalendarQuerySchema.parse(input));
  }
  @Get(':id/points')
  @Header('Cache-Control', 'private, no-store')
  points(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() input: unknown,
  ) {
    return this.reports.points(principal.id, id, arenaPointQuerySchema.parse(input));
  }
  @Get(':id/comparison')
  @Header('Cache-Control', 'private, no-store')
  compare(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() period: unknown,
  ) {
    return this.comparison.read(principal.id, id, arenaPeriodSchema.parse(period));
  }
  @Get(':id/rounds/:roundId')
  @Header('Cache-Control', 'private, no-store')
  round(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('roundId', new ParseUUIDPipe()) roundId: string,
  ) {
    return this.reports.read(principal.id, id, roundId);
  }
  @Get(':id')
  @Header('Cache-Control', 'private, no-store')
  async read(
    @CurrentIdentity() principal: IdentityPrincipal,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    const row = await this.arenas.read(principal.id, id);
    return arenaDetailSchema.parse({
      id: row.id,
      state: row.state,
      protocol: row.protocol,
      createdAt: row.createdAt.toISOString(),
      remaining: row.remaining,
      entrants: row.entrants.map((e) => ({
        id: e.id,
        providerId: e.providerId,
        model: e.model,
        cash: e.cash.toFixed(),
        remaining: e.remaining,
      })),
      rounds: row.rounds.map((r) => ({ id: r.id, tradingDate: r.tradingDate, outcome: r.outcome })),
    });
  }
}
