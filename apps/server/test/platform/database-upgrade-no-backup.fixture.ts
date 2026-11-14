import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { DatabaseStructureInput } from '../../src/platform/database-structure.js';

export const sql = readFileSync(new URL('../../prisma/migrations/20261112020000_optimization_manual_retry/migration.sql', import.meta.url), 'utf8');
export const target = { databaseName: 'thesis_ledger', ownerName: 'thesis_ledger' };
export const fromHead = '20261112010000_autonomous_model_arena';
export const source: DatabaseStructureInput = {
  migrations: [
    { name: fromHead, sqlPath: '', sql: 'CREATE TABLE "SchemaVersion" (id INT PRIMARY KEY, version TEXT, "updatedAt" TIMESTAMPTZ DEFAULT now()); CREATE TABLE "LedgerEvent" (id INT PRIMARY KEY, value TEXT); CREATE TABLE "OptimizationExperiment" (id INT PRIMARY KEY, value TEXT);' },
    { name: '20261112020000_optimization_manual_retry', sqlPath: '', sql },
  ],
  currentHead: '20261112020000_optimization_manual_retry',
  expectedTables: ['LedgerEvent', 'OptimizationExperiment', 'SchemaVersion'],
  prismaTables: ['LedgerEvent', 'OptimizationExperiment', 'SchemaVersion'], rawOwnedTables: [],
};
export const authorized = { source, fromHead, target, project: 'thesis-ledger-dev',
  approvedSha256: createHash('sha256').update(sql).digest('hex') };

