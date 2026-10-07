-- 旧双格式 Policy 只在数据库升级时显式收敛；保留旧修订作为审计记录。
-- 新修订必须重新经过 Control 目录和 RouteAdmission 校验后才可生效。
CREATE TABLE "DesiredProviderPolicyLegacyArchive" AS TABLE "DesiredProviderPolicy";
CREATE TABLE "DesiredProviderPolicyRevisionLegacyArchive" AS TABLE "DesiredProviderPolicyRevision";

DO $$
DECLARE
  old_policy "DesiredProviderPolicy"%ROWTYPE;
  next_revision INTEGER;
  next_routes JSONB;
BEGIN
  SELECT * INTO old_policy
  FROM "DesiredProviderPolicy"
  WHERE "consumer" = 'thesis-ledger'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF old_policy."routes"::jsonb->>'storageVersion' = '3'
     AND jsonb_typeof(old_policy."routes"::jsonb->'routes') = 'array'
     AND NOT old_policy."routes"::jsonb ? 'routesV3'
     AND NOT old_policy."routes"::jsonb ? 'legacyV2Routes' THEN
    RETURN;
  END IF;

  IF old_policy."routes"::jsonb->>'storageVersion' <> '3'
     OR jsonb_typeof(old_policy."routes"::jsonb->'routesV3') <> 'array'
     OR NOT old_policy."routes"::jsonb ? 'legacyV2Routes' THEN
    RAISE EXCEPTION 'Unsupported legacy Market Policy shape';
  END IF;

  next_revision := old_policy."revision" + 1;
  next_routes := jsonb_build_object(
    'storageVersion', 3,
    'routes', old_policy."routes"::jsonb->'routesV3'
  );

  UPDATE "DesiredProviderPolicy"
  SET "revision" = next_revision,
      "routes" = next_routes,
      "syncState" = 'rejected',
      "dsaRevision" = NULL,
      "syncedAt" = NULL,
      "lastError" = '{"code":"policy_requires_reapply","message":"旧策略已升级，需重新核对精确目录与准入"}'::jsonb,
      "effectiveProjection" = NULL,
      "updatedAt" = NOW()
  WHERE "consumer" = 'thesis-ledger';

  INSERT INTO "DesiredProviderPolicyRevision" (
    "id", "consumer", "revision", "enabled", "routes", "syncState",
    "lastError", "createdAt"
  ) VALUES (
    gen_random_uuid(), 'thesis-ledger', next_revision, old_policy."enabled",
    next_routes, 'rejected',
    '{"code":"policy_requires_reapply","message":"旧策略已升级，需重新核对精确目录与准入"}'::jsonb,
    NOW()
  );
END $$;
