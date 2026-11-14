import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  arenaLiveAccountSchema,
  arenaLiveProtocolSchema,
  arenaLiveResearchStepSchema,
} from '@thesis-ledger/schemas';
import { sanitize } from '../../ai/ai-sdk-generation-facts.js';
import { PrismaService } from '../../platform/prisma.service.js';
import { LiveResearchCall } from './live-research-call.js';
import { LiveResearchTools } from './live-research-tools.js';
import { LiveResearchBudget } from './live-research-budget.js';
import { LiveOrdersRepository } from './live-orders.repository.js';
import { type LiveCycleRow } from './live-storage.js';
import { LiveResearchControl } from './live-research-control.js';
import { buildLiveResearchMessages } from './live-research-messages.js';
import { liveDecisionFeedback } from './live-decision-feedback.js';

@Injectable()
export class LiveResearchRunner {
  private readonly active = new Set<LiveResearchControl>();
  private stopping = false;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(LiveResearchCall) private readonly call: Pick<LiveResearchCall, 'generate'>,
    @Inject(LiveResearchTools) private readonly tools: Pick<LiveResearchTools, 'execute'>,
    @Inject(LiveResearchBudget) private readonly budget: LiveResearchBudget,
    @Inject(LiveOrdersRepository) private readonly orders: Pick<LiveOrdersRepository, 'submit'>,
  ) {}
  stop() {
    this.stopping = true;
    for (const control of this.active) control.abort('worker_stopping');
  }
  async execute(id: string, attempt: number) {
    const [cycle] = await this.db.$queryRaw<
      LiveCycleRow[]
    >`SELECT * FROM "ArenaLiveCycle" WHERE id=${id}::uuid`;
    if (!isRunningResearchCycle(cycle, attempt, this.stopping)) return;
    const frozen = cycle.input as {
      account: unknown;
      protocol: unknown;
      asOf: string;
      replay?: boolean;
      marketSession?: {
        state: 'open' | 'closed' | 'unknown';
        date: string | null;
        reason: string | null;
      };
    };
    const p = arenaLiveProtocolSchema.parse(frozen.protocol),
      account = arenaLiveAccountSchema.parse(frozen.account);
    const messages = buildLiveResearchMessages({
      protocol: p,
      account,
      asOf: frozen.asOf,
      replay: frozen.replay === true,
      ...(frozen.marketSession ? { marketSession: frozen.marketSession } : {}),
    });
    let toolsUsed = 0;
    let decisionCorrections = 0;
    const control = new LiveResearchControl(this.db, id, attempt, cycle.deadlineAt);
    this.active.add(control);
    try {
      await control.start();
      for (
        let step = 0;
        p.resources.maxResearchSteps === null || step < p.resources.maxResearchSteps;
        step++
      ) {
        control.signal.throwIfAborted();
        const answer = arenaLiveResearchStepSchema.parse(
          await this.call.generate(id, attempt, messages, control.signal),
        );
        control.signal.throwIfAborted();
        messages.push({ role: 'assistant', content: JSON.stringify(answer) });
        if (answer.action === 'decision') {
          try {
            await this.orders.submit(id, attempt, answer.decision);
            return;
          } catch (error) {
            const feedback = liveDecisionFeedback(
              error,
              frozen.replay ? frozen.asOf : new Date().toISOString(),
            );
            const canContinue =
              p.resources.maxResearchSteps === null || step + 1 < p.resources.maxResearchSteps;
            if (!feedback || decisionCorrections >= 1 || !canContinue) throw error;
            decisionCorrections++;
            messages.push({ role: 'user', content: JSON.stringify(feedback) });
            continue;
          }
        }
        toolsUsed += answer.requests.length;
        if (p.resources.maxResearchSteps !== null && toolsUsed > p.resources.maxResearchSteps)
          throw new Error('tool_budget_exhausted');
        const results = await this.executeTools(
          id,
          attempt,
          p,
          answer.requests,
          control,
          frozen.replay ? frozen.asOf : undefined,
        );
        messages.push({
          role: 'user',
          content: JSON.stringify({
            toolResults: results,
            observedAt: frozen.replay ? frozen.asOf : new Date().toISOString(),
          }),
        });
      }
      throw new Error('research_steps_exhausted');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'research_failed';
      const reasons = new Set([
        'account_conflict',
        'cycle_not_active',
        'cycle_deadline',
        'participant_budget',
        'competition_budget',
        'unknown_pricing',
        'input_limit',
        'model_identity_unverified',
        'unknown_usage',
        'model_output_invalid',
        'tool_budget_exhausted',
        'research_steps_exhausted',
        'research_control_unavailable',
        'worker_stopping',
        'output_limit_unsupported',
        'request_limit_unrepresentable',
        'appointment_in_past',
        'execution_evidence_missing',
        'symbol_outside_universe',
        'insufficient_cash',
        'position_limit',
        'insufficient_position',
        'order_not_active',
        'expiry_calendar_unavailable',
        'market_closed',
        'replay_rules_unavailable',
        'replay_prices_unavailable',
        'replay_tools_unavailable',
      ]);
      await this.budget.fail(
        id,
        attempt,
        reasons.has(message) ? message : 'research_failed',
        sanitize(error),
      );
    } finally {
      await control.close();
      this.active.delete(control);
    }
  }
  private async executeTools(
    id: string,
    attempt: number,
    p: ReturnType<typeof arenaLiveProtocolSchema.parse>,
    requests: Extract<
      ReturnType<typeof arenaLiveResearchStepSchema.parse>,
      { action: 'tools' }
    >['requests'],
    control: LiveResearchControl,
    replayAsOf: string | undefined,
  ) {
    const results: unknown[] = [];
    for (const request of requests) {
      control.signal.throwIfAborted();
      const requestId = randomUUID(),
        used = { requests: 1, tokens: 0, costMicros: 0 };
      await this.budget.reserve(id, attempt, requestId, used, { kind: 'research_tool', request });
      let outcome: unknown;
      try {
        outcome = {
          status: 'ready',
          data: await this.tools.execute(p, request, control.signal, replayAsOf),
        };
      } catch (error) {
        outcome = { status: 'unavailable', reason: sanitize(error) };
      }
      await this.budget.settle(id, requestId, used, { kind: 'research_tool', outcome });
      await this.budget.tool(id, attempt, request, outcome);
      results.push({ request, outcome });
    }
    return results;
  }
}

function isRunningResearchCycle(
  cycle: LiveCycleRow | undefined,
  attempt: number,
  stopping: boolean,
): cycle is LiveCycleRow {
  return !(stopping || !cycle || cycle.state !== 'running' || cycle.attempt !== attempt);
}
