import { Module } from '@nestjs/common';
import { AiProviderValidationJournal } from './ai-provider-validation-journal.js';
import { AiProviderSaveService } from './ai-provider-save.service.js';
import { ProviderModule } from '../providers/provider.module.js';
import { AiController } from './ai.controller.js';
import { AiProviderController } from './ai-provider.controller.js';
import { AiSettingsController } from './ai-settings.controller.js';
import { AiProviderService } from './ai-provider.service.js';
import { AiRunService } from './ai-run.service.js';
import { AiResearchExecutor } from './ai-research.executor.js';
import { AiExecutionStateStore } from './ai-execution-state.store.js';
import { AiInvocationStore } from './ai-invocation.store.js';
import { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import { AiResearchSdkExecution } from './ai-research-sdk-execution.js';
import { AiProviderRegistry } from './provider-registry.js';
import { PromptVersionRegistry } from './prompt-registry.js';
import { AiRoutingSettingsService } from './ai-routing-settings.service.js';
import { researchPromptsV2 } from './ai-research-prompts-v2.js';
import { AiResearchReportsQuery } from './ai-research-reports.query.js';

@Module({
  imports: [ProviderModule],
  controllers: [AiController, AiProviderController, AiSettingsController],
  providers: [
    AiResearchReportsQuery,
    AiRunService,
    AiExecutionStateStore,
    AiInvocationStore,
    AiSdkGenerationAdapter,
    AiResearchSdkExecution,
    AiProviderService,
    AiProviderSaveService,
    AiProviderValidationJournal,
    AiRoutingSettingsService,
    AiProviderRegistry,
    {
      provide: PromptVersionRegistry,
      useFactory: () => {
        const registry = new PromptVersionRegistry();
        registry.register({
          name: 'research',
          version: 'research-v1',
          template:
            '你是研究助手。只基于已提供的服务端证据作答，输出 ResearchResult V1 JSON；不得生成订单或执行指令。',
          changedAt: new Date().toISOString(),
        });
        for (const prompt of researchPromptsV2) registry.register(prompt);
        return registry;
      },
    },
    AiResearchExecutor,
  ],
  exports: [
    AiResearchReportsQuery,
    AiRunService,
    AiExecutionStateStore,
    AiInvocationStore,
    AiSdkGenerationAdapter,
    AiResearchSdkExecution,
    AiProviderRegistry,
    PromptVersionRegistry,
    AiResearchExecutor,
    AiProviderService,
  ],
})
export class AiModule {}
