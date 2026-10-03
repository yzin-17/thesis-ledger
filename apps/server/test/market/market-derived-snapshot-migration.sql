-- 仅在隔离 PostgreSQL 执行；事务回滚保留测试前状态。
BEGIN;
DO $$
DECLARE
  fingerprint TEXT := repeat('a', 64);
  payload JSONB;
BEGIN
  payload := jsonb_build_object('contractVersion', 3, 'kind', 'locally-derived',
    'inputFingerprint', fingerprint, 'algorithmRevision', 'fixture-v1', 'input', '{}'::jsonb);
  INSERT INTO "MarketDerivedSeriesSnapshotV3" ("inputFingerprint", "algorithmRevision", "snapshot")
    VALUES (fingerprint, 'fixture-v1', payload);
  BEGIN
    INSERT INTO "MarketDerivedSeriesSnapshotV3" ("inputFingerprint", "algorithmRevision", "snapshot")
      VALUES (fingerprint, 'fixture-v1', payload);
    RAISE EXCEPTION '重复身份未被拒绝';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "MarketDerivedSeriesSnapshotV3" ("inputFingerprint", "algorithmRevision", "snapshot")
      VALUES (repeat('b', 64), 'fixture-v1', payload);
    RAISE EXCEPTION '不一致的载荷身份未被拒绝';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO "MarketDerivedSeriesSnapshotV3" ("inputFingerprint", "algorithmRevision", "snapshot")
      VALUES (repeat('c', 64), 'fixture-v1', '{}'::jsonb);
    RAISE EXCEPTION '缺少输入的载荷未被拒绝';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
