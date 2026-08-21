import { Module } from '@nestjs/common';
import { ProviderModule } from '../providers/provider.module.js';
import { RiskController } from './risk.controller.js';
import { RiskService } from './risk.service.js';

@Module({
  imports: [ProviderModule],
  controllers: [RiskController],
  providers: [RiskService],
  exports: [RiskService],
})
export class RiskModule {}
