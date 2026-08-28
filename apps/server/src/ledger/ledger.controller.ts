import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  confirmBaselineReconciliationCommandSchemaV2,
  createBaselineObservationBatchCommandSchemaV2,
  createExecutionCommandSchemaV2,
  createImportDraftRevisionCommandSchemaV2,
  moveExecutionAccountCommandSchemaV2,
  replaceExecutionCommandSchemaV2,
  restoreBaselineReconciliationCommandSchemaV2,
  restoreExecutionCommandSchemaV2,
  reviseImportDraftCommandSchemaV2,
  submitImportDraftRevisionCommandSchemaV2,
  voidBaselineReconciliationCommandSchemaV2,
  voidExecutionCommandSchemaV2,
} from '@thesis-ledger/schemas';
import { z } from 'zod';
import { BaselineReconciliationService } from './baseline-reconciliation.service.js';
import { BaselineImportService } from './baseline-import.service.js';
import { LedgerCommandService } from './ledger-command.service.js';
import { LedgerQueryService } from './ledger-query.service.js';
import { LedgerService } from './ledger.service.js';

const migratePositionsHttpSchema = z.object({ accountId: z.uuid().optional() });
const rebuildMethodSchema = z.enum(['AVG', 'FIFO']).optional();
const accountIdPathSchema = z.uuid();
const ledgerRevisionQuerySchema = z.object({
  asOfRevision: z.string().regex(/^\d+$/).optional(),
});
const replayRevisionQuerySchema = z.object({ asOfRevision: z.string().regex(/^\d+$/) });

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledger: LedgerService,
    private readonly commands: LedgerCommandService,
    private readonly imports: BaselineImportService,
    private readonly reconciliation: BaselineReconciliationService,
    private readonly queries: LedgerQueryService,
  ) {}

  @Post('events')
  append(@Body() event: unknown) {
    return this.ledger.append(event);
  }

  @Post('executions')
  createExecution(@Body() command: unknown) {
    return this.commands.createExecution(createExecutionCommandSchemaV2.parse(command));
  }

  @Post('executions/replace')
  replaceExecution(@Body() command: unknown) {
    return this.commands.replaceExecution(replaceExecutionCommandSchemaV2.parse(command));
  }

  @Post('executions/void')
  voidExecution(@Body() command: unknown) {
    return this.commands.voidExecution(voidExecutionCommandSchemaV2.parse(command));
  }

  @Post('executions/restore')
  restoreExecution(@Body() command: unknown) {
    return this.commands.restoreExecution(restoreExecutionCommandSchemaV2.parse(command));
  }

  @Post('executions/move-account')
  moveExecutionAccount(@Body() command: unknown) {
    return this.commands.moveExecutionAccount(moveExecutionAccountCommandSchemaV2.parse(command));
  }

  @Post('baseline-observation-batches')
  createBaselineObservationBatch(@Body() command: unknown) {
    return this.imports.createBaselineBatch(
      createBaselineObservationBatchCommandSchemaV2.parse(command),
    );
  }

  @Post('import-draft-revisions')
  createImportDraftRevision(@Body() command: unknown) {
    return this.imports.createImportDraft(createImportDraftRevisionCommandSchemaV2.parse(command));
  }

  @Post('import-draft-revisions/revise')
  reviseImportDraft(@Body() command: unknown) {
    return this.imports.reviseImportDraft(reviseImportDraftCommandSchemaV2.parse(command));
  }

  @Post('import-draft-revisions/submit')
  submitImportDraftRevision(@Body() command: unknown) {
    return this.imports.submitImportDraft(submitImportDraftRevisionCommandSchemaV2.parse(command));
  }

  @Post(':accountId/rebuild')
  rebuild(@Param('accountId') accountId: string, @Query('method') method?: string) {
    return this.ledger.rebuild(accountId, rebuildMethodSchema.parse(method));
  }

  @Post('migrate-positions')
  migratePositions(@Body() input: unknown) {
    return this.ledger.migratePositions(migratePositionsHttpSchema.parse(input).accountId);
  }

  @Get(':accountId/events')
  events(@Param('accountId') accountId: string, @Query('asOfRevision') asOfRevision?: string) {
    const query = ledgerRevisionQuerySchema.parse({
      ...(asOfRevision === undefined ? {} : { asOfRevision }),
    });
    return this.queries.effectiveEvents(accountIdPathSchema.parse(accountId), query.asOfRevision);
  }

  @Get(':accountId/events/audit')
  auditEvents(@Param('accountId') accountId: string, @Query('asOfRevision') asOfRevision?: string) {
    const query = ledgerRevisionQuerySchema.parse({
      ...(asOfRevision === undefined ? {} : { asOfRevision }),
    });
    return this.queries.auditEvents(accountIdPathSchema.parse(accountId), query.asOfRevision);
  }

  @Get(':accountId/events/replay')
  replayEvents(
    @Param('accountId') accountId: string,
    @Query('asOfRevision') asOfRevision?: string,
  ) {
    const query = replayRevisionQuerySchema.parse({
      ...(asOfRevision === undefined ? {} : { asOfRevision }),
    });
    return this.queries.replay(accountIdPathSchema.parse(accountId), query.asOfRevision);
  }

  @Get(':accountId/reconciliation-candidates')
  reconciliationCandidates(@Param('accountId') accountId: string) {
    return this.reconciliation.candidates(accountIdPathSchema.parse(accountId));
  }

  @Post('reconciliations/confirm')
  confirmReconciliation(@Body() command: unknown) {
    return this.reconciliation.confirm(confirmBaselineReconciliationCommandSchemaV2.parse(command));
  }

  @Post('reconciliations/void')
  voidReconciliation(@Body() command: unknown) {
    return this.reconciliation.void(voidBaselineReconciliationCommandSchemaV2.parse(command));
  }

  @Post('reconciliations/restore')
  restoreReconciliation(@Body() command: unknown) {
    return this.reconciliation.restore(restoreBaselineReconciliationCommandSchemaV2.parse(command));
  }
}
