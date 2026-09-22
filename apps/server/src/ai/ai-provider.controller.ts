import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Optional,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { aiProviderValidationAuthorizationSchema } from '@thesis-ledger/schemas';
import { AiProviderSaveService } from './ai-provider-save.service.js';
import { AiProviderService } from './ai-provider.service.js';
import {
  aiProviderInputSchema,
  aiProviderModelCatalogInputSchema,
  aiProviderTestOptionsSchema,
  aiProviderTestInputSchema,
  aiProviderTestCancelInputSchema,
  aiProviderLifecycleOptionsSchema,
} from './ai-provider.contracts.js';

const enabledSchema = z
  .object({ enabled: z.boolean() })
  .merge(aiProviderLifecycleOptionsSchema)
  .strict();

@Controller('ai/providers')
export class AiProviderController {
  constructor(
    private readonly providers: AiProviderService,
    @Optional() private readonly validated?: AiProviderSaveService,
  ) {}

  private verifiedSave() {
    if (!this.validated) throw new BadRequestException('验证服务未装配，不能保存启用配置');
    return this.validated;
  }

  @Post('validation-plan')
  validationPlan(@Body() input: unknown) {
    return this.verifiedSave().plan(input);
  }

  @Post('test-and-save')
  testAndSave(@Body() body: unknown) {
    const input = z
      .object({ provider: z.unknown(), authorization: aiProviderValidationAuthorizationSchema })
      .strict()
      .parse(body);
    return this.verifiedSave().testAndSave(input.provider, input.authorization);
  }

  @Post(':name/validation/cancel')
  cancelValidation(@Param('name') name: string, @Body() body: unknown) {
    const input = z.object({ operationId: z.uuid() }).strict().parse(body);
    return this.verifiedSave().cancel(name, input.operationId);
  }

  @Get()
  list() {
    return this.providers.list();
  }

  @Post('migration/dry-run')
  migrationDryRun() {
    return this.providers.migrationDryRun();
  }

  @Post()
  save(@Body() input: unknown) {
    return this.verifiedSave().save(aiProviderInputSchema.parse(input));
  }

  @Post('test')
  testDraft(@Body() input: unknown) {
    return this.providers.testDraft(aiProviderTestInputSchema.parse(input));
  }

  @Post('models')
  models(@Body() input: unknown) {
    return this.providers.models(aiProviderModelCatalogInputSchema.parse(input));
  }

  @Post(':name/test')
  testSaved(@Param('name') name: string, @Body() input: unknown) {
    const options = aiProviderTestOptionsSchema.parse(input ?? {});
    return this.providers.testSaved(name, {
      ...(options.model === undefined ? {} : { model: options.model }),
      ...(options.testKind === undefined ? {} : { testKind: options.testKind }),
      ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
      ...(options.mode === undefined ? {} : { mode: options.mode }),
      ...(options.budgetAuthorized === undefined
        ? {}
        : { budgetAuthorized: options.budgetAuthorized }),
      ...(options.requestId === undefined ? {} : { requestId: options.requestId }),
    });
  }

  @Post(':name/test/cancel')
  cancelTest(@Param('name') name: string, @Body() input: unknown) {
    const parsed = aiProviderTestCancelInputSchema.parse(input);
    return this.providers.cancelTest(name, parsed.requestId);
  }

  @Get(':name/readiness')
  readiness(@Param('name') name: string) {
    return this.providers.readiness(name);
  }

  @Patch(':name/enabled')
  setEnabled(@Param('name') name: string, @Body() input: unknown) {
    const parsed = enabledSchema.parse(input);
    return this.verifiedSave().setEnabled(name, parsed.enabled, parsed);
  }

  @Delete(':name')
  remove(@Param('name') name: string, @Body() input: unknown) {
    const parsed = aiProviderLifecycleOptionsSchema.parse(input ?? {});
    return this.providers.remove(name, parsed);
  }
}
