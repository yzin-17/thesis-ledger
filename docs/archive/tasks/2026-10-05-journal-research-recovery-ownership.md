# 复盘研究恢复实施

对应[规格](../../specs/2026-10-05-journal-research-recovery-ownership.md)，承接复盘收口 J7。

- [x] P1 状态机：研究归属按 AI SDK/冻结契约识别，排除通用重排，原子终态保持 attempt 条件；定向回归九项通过。
- [x] P2 执行与消费：隔离 PostgreSQL 复验实际 JSON 查询及单笔/周期不同 prompt；十项通过。Server 类型、构建和边界通过，错误码消费不扩展事实。
- [x] P3 部署验收：当前健康容器使用官方 `sync-code.sh thesis-ledger`，兼容预检通过后复验一个新的标记任务；原失败任务、账本、旧报告和默认配置保留。

官方快更退出 0，兼容预检、Server/Worker 健康和镜像身份保持验证通过。新目标运行 `34abe590-02d6-4bb9-8018-17ec2909bd5a` 收敛为 `failed/research_unknown_outcome`，attempt 1、请求一条；同一 Server 容器/镜像恢复，Worker、账本、旧报告和默认配置保持不变。目标故障复验已通过；最终再经 `update.sh thesis-ledger` 固化修复到镜像后关闭 P3，避免只留下可写层部署。日志为 `/private/tmp/tl-journal-target-recovery-fixed.log`。

最终官方更新退出 0，Server/Worker 镜像为 `sha256:99eceddcd672da579570c6c43c32757844e14315141d018a42b005620f4da6c4`，均健康。镜像内恢复模块与当前编译产物 SHA-256 同为 `37165b4e2a18edc07f5df3c88041b459ff9ae56de84f763348ceb1a531125b74`。保护性读取再次通过，默认与旧报告保持。范围内实现、契约、定向/隔离测试、类型/构建与真实运行态已闭合，本叶任务完成归档；原 Journal 浏览器、设备和远端 CI 门禁继续开放。

隔离执行入口为 `node scripts/test-ai-provider-postgres.mjs test/ai/ai-research-recovery-postgres.integration.test.ts`，覆盖当前 32 个迁移，使用独立 `ai_provider_concurrency_fixture` 与 `fixture_owner`，结束后清理该测试容器。维护入口同时提供 `AI_EXECUTION_DATABASE_URL`，不再以条件式跳过代替恢复测试。日志为 `/private/tmp/tl-journal-recovery-postgres.log`。

首次真实目标验收运行 `5ca9fa5a-1f07-45c9-a266-7a17ae17b0ac` 保留原终态和 attempt 2；不改写为修复后成功，不重复提交该运行。原 SDK 请求 ID 只有一条，发送门禁阻止了重复请求；外部收到或计费仍不能由 dispatching 状态推断。
