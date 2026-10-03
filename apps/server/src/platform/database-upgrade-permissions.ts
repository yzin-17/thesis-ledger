/** 查询实际有效权限；每项单独判断，避免 PostgreSQL 逗号权限列表的“任一满足”语义。 */
export function buildUpgradePermissionsCheck(appRole: string) {
  if (!appRole.trim() || appRole !== appRole.trim() || appRole.includes('\0'))
    throw new Error('应用角色无效');
  const role = `'${appRole.replaceAll("'", "''")}'`;
  return `SELECT EXISTS (
    SELECT 1 FROM pg_roles r WHERE r.rolname = ${role}
      AND r.rolname <> current_user AND r.rolcanlogin
      AND NOT (r.rolsuper OR r.rolcreatedb OR r.rolcreaterole OR r.rolreplication OR r.rolbypassrls)
      AND has_database_privilege(r.oid, current_database(), 'CONNECT')
      AND has_schema_privilege(r.oid, 'public', 'USAGE')
      AND NOT has_schema_privilege(r.oid, 'public', 'CREATE')
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) p(privilege)
        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
          AND has_table_privilege(r.oid, c.oid, p.privilege) IS DISTINCT FROM
            (CASE WHEN c.relname = 'SchemaVersion' THEN p.privilege = 'SELECT'
                  WHEN c.relname = 'LedgerEvent' THEN p.privilege IN ('SELECT', 'INSERT')
                  ELSE true END)
      )
      AND NOT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        CROSS JOIN (VALUES ('USAGE'), ('SELECT')) p(privilege)
        WHERE n.nspname = 'public' AND c.relkind = 'S'
          AND NOT has_sequence_privilege(r.oid, c.oid, p.privilege)
      )
  );`;
}
