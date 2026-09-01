-- 迁移前 NotificationDelivery 通过 eventId 关联 RiskEvent。
INSERT INTO "RiskRule" (
  "id", "version", "kind", "scope", "severity", "threshold", "enabled",
  "needsRepair", "symbol", "accountId", "condition", "parameters", "config",
  "effectiveAt", "createdAt", "updatedAt"
) VALUES (
  '11111111-1111-4111-8111-111111111111', 1, 'price-below', 'security', 'warning', 100,
  true, false, '600519.SH', NULL, '{"operator":"<"}', '{"window":1}', NULL,
  '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z', '2026-08-20T00:00:00Z'
);

INSERT INTO "RiskEvent" (
  "id", "ruleId", "ruleVersion", "triggered", "severity", "message", "mode",
  "accountId", "symbol", "triggerValue", "threshold", "marketTime", "scanId",
  "dedupeKey", "context", "evaluatedAt"
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  1, true, 'warning', '历史风险事件正文', 'actual', NULL, '600519.SH', 90, 100, NULL, NULL,
  'legacy-notification-fixture-event', '{"traceId":"legacy-trace-1"}',
  '2026-08-20T00:01:00Z'
);

INSERT INTO "NotificationDelivery" (
  "id", "eventId", "channel", "provider", "severity", "status", "attemptCount",
  "dedupKey", "scheduledAt", "deliveredAt", "lastError", "errorCode", "responseSummary"
) VALUES
  (
    '33333333-3333-4333-8333-333333333333',
    '22222222-2222-4222-8222-222222222222',
    'feishu', 'feishu', 'warning', 'retrying', 1, 'legacy-notification-dedup-1',
    '2026-08-20T00:02:00Z', NULL, '旧投递暂时失败', 'feishu_http_500', NULL
  ),
  (
    '44444444-4444-4444-8444-444444444444',
    '22222222-2222-4222-8222-222222222222',
    'feishu', 'feishu', 'legacy-severity', 'failed', 3, 'legacy-notification-dedup-2',
    '2026-08-20T00:03:00Z', NULL, '旧投递失败', 'feishu_http_400', NULL
  );
