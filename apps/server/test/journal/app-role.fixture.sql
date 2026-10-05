-- 仅供新建的 journal_review_fixture 临时数据库；不作为目标部署权限输入。
CREATE ROLE fixture_app LOGIN PASSWORD 'isolated_fixture' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE journal_review_fixture TO fixture_app;
GRANT USAGE ON SCHEMA public TO fixture_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO fixture_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO fixture_app;
REVOKE INSERT, UPDATE, DELETE ON "SchemaVersion" FROM fixture_app;
REVOKE UPDATE, DELETE ON "LedgerEvent" FROM fixture_app;
