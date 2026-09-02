export const CURRENT_SCHEMA_VERSION = '20260902000000_fresh_database_baseline';

type SchemaVersionRow = { version?: unknown };

export const parseDatabaseSchemaVersion = (result: unknown): string | null => {
  if (!Array.isArray(result)) return null;
  const row = result[0] as SchemaVersionRow | undefined;
  return typeof row?.version === 'string' ? row.version : null;
};

export const readDatabaseSchemaVersion = async (
  query: () => Promise<unknown>,
): Promise<string | null> => parseDatabaseSchemaVersion(await query());

export const isCurrentDatabaseSchemaVersion = (version: string | null) =>
  version === CURRENT_SCHEMA_VERSION;

export const assertDatabaseSchemaVersion = async (query: () => Promise<unknown>) => {
  const version = await readDatabaseSchemaVersion(query);
  if (!isCurrentDatabaseSchemaVersion(version)) {
    throw new Error(
      `Database schema version mismatch: expected ${CURRENT_SCHEMA_VERSION}, got ${version ?? '<missing>'}`,
    );
  }
  return version;
};
