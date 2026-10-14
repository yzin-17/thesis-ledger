import {
  Body,
  Controller,
  Get,
  Headers,
  Optional,
  Param,
  Post,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { filter, concatMap } from 'rxjs';
import { IdentityService, IDENTITY_SESSION_HEADER } from '../identity/identity.service.js';
import { CurrentStrategyOwner, StrategyIdentityGuard } from './strategy-identity.guard.js';
import { StrategyAccessService } from './strategy-access.service.js';
import { z } from 'zod';
import { BacktestService } from './backtest.service.js';
import { BacktestEventService } from './backtest-event.service.js';
import { withBacktestModelDisclosure } from './backtest-model-disclosure.js';
import { localIdentityPrincipal } from '../identity/local-workspace.js';

const createStrategyHttpSchema = z.object({
  name: z.string().trim().min(1).max(120),
  schema: z.unknown(),
  description: z.string().max(2_000).optional(),
});
const createVersionHttpSchema = z.object({ schema: z.unknown() });

@Controller('backtests')
@UseGuards(StrategyIdentityGuard)
export class BacktestController {
  constructor(
    private readonly backtests: BacktestService,
    private readonly jobEvents: BacktestEventService,
    private readonly access: StrategyAccessService,
    @Optional() private readonly identities?: IdentityService,
  ) {}

  @Post('strategies')
  createStrategy(@Body() input: unknown, @CurrentStrategyOwner() ownerId: string | null) {
    const body = createStrategyHttpSchema.parse(input);
    return this.backtests.createStrategy(body.name, body.schema, body.description, ownerId);
  }

  @Post('strategies/:id/versions')
  createVersion(@Param('id') id: string, @Body() input: unknown) {
    return this.backtests.createVersion(id, createVersionHttpSchema.parse(input).schema);
  }

  @Post('runs')
  createRun(@Body() body: unknown) {
    return this.backtests.createRun(body).then(withBacktestModelDisclosure);
  }

  @Post('runs/:id/cancel')
  cancelRun(@Param('id') id: string) {
    return this.backtests.cancelCurrentRunForRead(id);
  }

  @Post('runs/:id/retry')
  retryRun(@Param('id') id: string) {
    return this.backtests.retryCurrentRunForRead(id);
  }

  @Post('runs/:id/run')
  runCurrent(@Param('id') id: string) {
    return this.backtests.runCurrentRunForRead(id);
  }

  @Get('runs')
  runs(@CurrentStrategyOwner() ownerId: string | null) {
    return this.backtests.listCurrentRunSummaries(ownerId);
  }

  @Get('runs/:id')
  runStatus(@Param('id') id: string) {
    return this.backtests.currentRunForRead(id).then(withBacktestModelDisclosure);
  }

  @Sse('events')
  events(
    @CurrentStrategyOwner() ownerId: string | null,
    @Headers(IDENTITY_SESSION_HEADER) token?: string,
  ) {
    return this.jobEvents.stream().pipe(
      concatMap(async (event) => {
        if (ownerId && localIdentityPrincipal()?.id !== ownerId) {
          if (!token || !this.identities) return null;
          try {
            if ((await this.identities.requireSession(token)).id !== ownerId) return null;
          } catch {
            return null;
          }
        }
        if (event.type === 'heartbeat' || (await this.access.canReadRun(event.data.id, ownerId)))
          return event;
        return null;
      }),
      filter((event) => event !== null),
    );
  }

  @Get('strategies')
  strategies(@CurrentStrategyOwner() ownerId: string | null) {
    return this.backtests.listStrategies(ownerId).then((strategies) =>
      strategies.map((strategy) => ({
        ...strategy,
        versions: strategy.versions.filter((version) => version.version > 0),
      })),
    );
  }
}
