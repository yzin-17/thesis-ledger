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
import { AiSdkGenerationAdapter } from './ai-sdk-generation.adapter.js';
import { AiResearchSdkExecution } from './ai-research-sdk-execution.js';
import { AiProviderRegistry } from './provider-registry.js';
import { PromptVersionRegistry } from './prompt-registry.js';
import { createConfiguredAiProviders } from './provider-adapters.js';
import { loadConfig } from '../platform/config.js';
import { AiRoutingSettingsService } from './ai-routing-settings.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [AiController, AiProviderController, AiSettingsController],
  providers: [
    AiRunService,
    AiExecutionStateStore,
    AiSdkGenerationAdapter,
    AiResearchSdkExecution,
    AiProviderService,
    AiProviderSaveService,
    AiProviderValidationJournal,
    AiRoutingSettingsService,
    {
      provide: AiProviderRegistry,
      useFactory: () => {
        const registry = new AiProviderRegistry();
        for (const provider of createConfiguredAiProviders(loadConfig()))
          registry.register(provider);
        return registry;
      },
    },
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
        return registry;
      },
    },
    AiResearchExecutor,
  ],
  exports: [
    AiRunService,
    AiExecutionStateStore,
    AiSdkGenerationAdapter,
    AiResearchSdkExecution,
    AiProviderRegistry,
    PromptVersionRegistry,
    AiResearchExecutor,
    AiProviderService,
  ],
})
export class AiModule {}
