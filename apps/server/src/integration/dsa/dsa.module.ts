import { Module } from '@nestjs/common';
import { DsaClient } from './dsa.client.js';

@Module({
  providers: [DsaClient],
  exports: [DsaClient],
})
export class DsaModule {}
