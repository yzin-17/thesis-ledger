import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { assertDatabaseSchemaVersion } from './schema-version.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    try {
      await assertDatabaseSchemaVersion(
        () => this.$queryRaw`SELECT "version" FROM "SchemaVersion" WHERE "id" = 1 LIMIT 1`,
      );
    } catch (error) {
      await this.$disconnect();
      throw error;
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
