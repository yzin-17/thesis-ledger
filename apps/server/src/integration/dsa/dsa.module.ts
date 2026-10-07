import { Module } from '@nestjs/common';
import { DsaClient } from './dsa.client.js';
import { DsaNavClient } from './dsa-nav-client.js';

@Module({
  providers: [DsaClient, DsaNavClient],
  exports: [DsaClient, DsaNavClient],
})
export class DsaModule {}
