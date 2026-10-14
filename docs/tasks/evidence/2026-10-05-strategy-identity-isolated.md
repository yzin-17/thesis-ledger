# 策略编写身份隔离验收

身份合同、密码处理、会话存储、Guard 和草稿 Controller 已实现。用户由服务端密码验证产生，`x-thesis-ledger-session` 只携带随机会话令牌；数据库保存令牌 SHA-256。普通 owner 字段、用户名或用户 UUID 不能代替会话。当前身份范围是策略编写，不宣称存量账户全局多租户。

2026-10-05 维护入口：`IDENTITY_ISOLATED=1 node scripts/test-journal-review-postgres.mjs test/identity/identity-postgres.integration.test.ts` exit 0。新建隔离 PostgreSQL、`journal_review_fixture`/`fixture_owner`，全部 29 项 migration，head `20261005130000_identity_sessions`；测试实际使用无 superuser/createdb 权限的 `fixture_app`。本轮三项真实 HTTP 测试通过，容器已由入口清理。

实际验证用户名归一化与唯一约束、密码登录、相同错密码/缺失用户响应、只存会话摘要、不泄露密码散列；共享网关不能代替用户。两个实际用户之间的读取/修改/丢弃草稿均返回 404，列表隔离；请求 owner 注入返回 400。分页游标、预期修订冲突、终态不可写、会话撤销/过期和用户禁用通过。

定向 13 项通过，14 项既有 PostgreSQL 环境项跳过；Server typecheck、直接 lint、build（隔离入口构建）、runtime database input、模块边界与以 HEAD 为基线的尺寸 ratchet 通过。Prisma Schema 仅追加两个身份模型；新增 migration 未改历史 SQL。

目标运行态尚未升级本叶：其 head 保持 `20261004140000_strategy_authoring_records`。I4 和原自然语言策略产品 AC 保持未完成，后续统一保数据部署；客户端登录及正式策略归属另由 T06/T04 实现。
