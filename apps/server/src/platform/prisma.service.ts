import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { discoverDatabaseStructure, inspectDatabaseStructure } from './database-structure.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    try {
      const structure = await discoverDatabaseStructure();
      const tables = await this.$queryRaw<{ tableName: string }[]>`
        SELECT c.relname AS "tableName"
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      `;
      const version = tables.some((row) => row.tableName === 'SchemaVersion')
        ? await this.$queryRaw<{ version: string }[]>`
            SELECT "version" FROM "SchemaVersion" WHERE "id" = 1 LIMIT 1
          `
        : [];
      const report = await inspectDatabaseStructure(
        structure,
        () => Promise.resolve(tables),
        () => Promise.resolve(version),
      );
      if (report.databaseVersion !== report.currentHead) {
        throw new Error(
          `Database schema version mismatch: expected ${report.currentHead}, got ${report.databaseVersion ?? '<missing>'}; missing tables: ${report.missingTables.join(', ') || '<none>'}`,
        );
      }
      if (!report.ready) {
        throw new Error(
          `Database structure mismatch: expected head ${report.currentHead}, got ${report.databaseVersion ?? '<missing>'}; missing tables: ${report.missingTables.join(', ') || '<none>'}`,
        );
      }
    } catch (error) {
      await this.$disconnect();
      throw error;
    }
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
