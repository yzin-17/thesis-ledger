import json
import os
from pathlib import Path
import subprocess
import time
import uuid

# 仅创建本测试的临时 PostgreSQL，不挂载已有业务 volume。
root = Path(__file__).resolve().parent.parent
container = 'thesis-ledger-db-review-' + uuid.uuid4().hex[:10]
owner = 'review_owner'
app = 'review_app'
results = {}

def run(args, input=None, ok=True, env=None, cwd=None):
    result = subprocess.run(args, input=input, text=True, capture_output=True,
                            env=env, cwd=cwd, timeout=90)
    if ok and result.returncode != 0:
        raise RuntimeError(result.stderr[-2000:])
    return result

def sql(database, statement, ok=True):
    return run(['docker', 'exec', '-i', container, 'psql', '-XqAt', '-v',
                'ON_ERROR_STOP=1', '-U', owner, '-d', database, '-f', '-'], statement, ok)

def generate(database, mode='rebuild'):
    env = dict(os.environ, NODE_ENV='development',
        DEV_DATABASE_MODE=mode, DEV_DATABASE_ALLOW_DATA_LOSS='true',
        DEV_DATABASE_PROJECT='review', DEV_DATABASE_CONFIRM='review/' + database,
        DEV_DATABASE_EXPECTED_DATABASE=database, DEV_DATABASE_EXPECTED_OWNER=owner,
        DATABASE_URL='postgresql://review:placeholder@postgres/' + database,
        DEV_DATABASE_PERMISSIONS_SQL=str(root.parent / 'thesis-ledger-infra/scripts/bootstrap-app-role.sql'),
        THESIS_LEDGER_SCHEMA_INPUT_ROOT=str(root / 'apps/server/prisma'))
    return run(['node', 'apps/server/dist/src/platform/dev-database-rebuild.js'],
               env=env, cwd=root).stdout

started = False
try:
    run(['docker', 'run', '--pull', 'never', '-d', '--name', container,
         '--tmpfs', '/var/lib/postgresql/data', '-e', 'POSTGRES_USER=' + owner,
         '-e', 'POSTGRES_PASSWORD=review_placeholder', '-e', 'POSTGRES_DB=review_a',
         '-e', 'POSTGRES_OWNER_USER=' + owner, '-e', 'POSTGRES_APP_USER=' + app,
         '-e', 'POSTGRES_APP_PASSWORD=review_app_placeholder', 'postgres:17-alpine'])
    started = True
    for attempt in range(40):
        if run(['docker', 'exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', owner, '-d', 'review_a'], ok=False).returncode == 0:
            break
        time.sleep(0.5)
    else:
        raise RuntimeError('隔离 PostgreSQL 未就绪')

    migrations = sorted((root / 'apps/server/prisma/migrations').glob('*/migration.sql'))
    head = migrations[-1].parent.name
    sql('review_a', 'CREATE DATABASE review_empty; CREATE DATABASE review_b;')
    sql('review_empty', generate('review_empty'))
    count = sql('review_empty', "SELECT count(*) FROM pg_tables WHERE schemaname='public';").stdout.strip()
    assert count == '66', count
    results['空库完整重建'] = {'表数': int(count), 'head': head}

    sql('review_a', migrations[0].read_text())
    old_head = sql('review_a', 'SELECT "version" FROM "SchemaVersion";').stdout.strip()
    assert old_head == migrations[0].parent.name
    sql('review_a', 'CREATE TABLE "__RebuildReviewSentinel" (id integer); INSERT INTO "__RebuildReviewSentinel" VALUES (41);')
    rebuild = generate('review_a')
    sql('review_a', rebuild)
    assert sql('review_a', 'SELECT "version" FROM "SchemaVersion";').stdout.strip() == head
    assert sql('review_a', "SELECT to_regclass('public.\"__RebuildReviewSentinel\"') IS NULL;").stdout.strip() == 't'
    results['baseline升级为当前结构'] = True

    sql('review_a', 'CREATE TABLE "__RebuildReviewSentinel" (id integer); INSERT INTO "__RebuildReviewSentinel" VALUES (42);')
    bad_sql = rebuild.rsplit('COMMIT;', 1)[0] + 'SELECT 1 / 0;\nCOMMIT;\n'
    failed = sql('review_a', bad_sql, ok=False)
    assert failed.returncode != 0
    assert sql('review_a', 'SELECT id FROM "__RebuildReviewSentinel";').stdout.strip() == '42'
    results['失败回滚保留原数据'] = True

    sql('review_a', rebuild)
    assert sql('review_a', "SELECT to_regclass('public.\"__RebuildReviewSentinel\"') IS NULL;").stdout.strip() == 't'
    assert sql('review_a', "SELECT to_regclass('public._prisma_migrations') IS NULL;").stdout.strip() == 't'
    results['重复重建清空旧数据且不建迁移历史'] = True

    permissions = sql('review_a', "SELECT has_table_privilege('review_app', 'public.\"StrategyRiskApplication\"', 'INSERT'), has_table_privilege('review_app', 'public.\"LedgerEvent\"', 'UPDATE'), has_table_privilege('review_app', 'public.\"SchemaVersion\"', 'UPDATE');").stdout.strip()
    assert permissions == 't|f|f', permissions
    results['raw表及LedgerEvent和版本写权限'] = True

    sql('review_b', 'CREATE TABLE sentinel (id integer); INSERT INTO sentinel VALUES (7);')
    assert sql('review_b', rebuild, ok=False).returncode != 0
    assert sql('review_b', 'SELECT id FROM sentinel;').stdout.strip() == '7'
    results['A目标连接B拒绝且保留B数据'] = True

    sql('review_a', 'DROP TABLE "StrategyRiskApplicationAudit";')
    assert sql('review_a', generate('review_a', 'check'), ok=False).returncode != 0
    results['当前版本缺raw表仍拒绝'] = True
    print(json.dumps(results, ensure_ascii=False, indent=2))
finally:
    if started:
        run(['docker', 'rm', '-f', '-v', container], ok=False)
