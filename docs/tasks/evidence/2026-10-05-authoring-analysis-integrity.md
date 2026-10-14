# 编写分析引用与原子应用验收

本叶仅完成 T03 的分析结果引用、答案确认边界和原子应用。完整的标的目录、关键参数澄清、生成覆盖与语义校验尚未完成。

## 结果与确认保护

分析需求原文必须出现在冻结描述或用户已确认答案中；伪造原文、错修订、未知/循环问题依赖、模型代确认或移除需求均被拒绝。相同问题保留原确认；问题或依赖变化将相关答案转为待审核，保留答案文本供用户检查。原需求、运行意图、用户移除记录和手动定义不会因模型遗漏而丢失。超限内容拒绝，不截断。

纯函数 6 项通过：`pnpm --filter @thesis-ledger/server exec vitest run test/strategy-authoring/authoring-analysis.test.ts`。执行器在记录实际收到响应、模型和用量后检查分析结果；伪造原文为 failed/received/`AUTHORING_ANALYSIS_INVALID`，没有重新调用模型或写入草稿。

## 实际数据库与 HTTP

`IDENTITY_ISOLATED=1 AUTHORING_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/identity/identity-postgres.integration.test.ts test/strategy-authoring/authoring-execution.integration.test.ts` exit 0；最终 15 项通过，无条件跳过。新建 PostgreSQL、Redis 和随机编写队列，实际使用受限应用角色、Nest HTTP、BullMQ 与本机受控 Provider，结束后入口清理容器。

本轮执行全部 32 项 migration，head 为 `20261005143000_authoring_analysis_application`。新增 migration 扩展操作 disposition，applied 仅允许 succeeded 操作；未改历史 SQL，表数量保持 80。

真实 HTTP 验证跨用户应用返回 404、额外输出注入被拒；两个并发应用只追加一个修订并返回同一引用。之后编辑到第三修订，再重试原应用仍返回第二修订引用，第三修订内容保持原状；其他旧分析应用返回冲突。实际数据库仅有三个修订，无重复追加。

同批受控请求验证三个用途、格式失败、模型切换、输出字节上限、在途取消、过期后的晚到响应与计价配置变化。取消保留 received 事实；过期操作保持 failed/unknown，审计顺序为 dispatching → unknown → received。计价配置变化在派发前拒绝，未调用模型，事实为 not_sent，费用保持未知。

Server typecheck、直接 lint、build（维护隔离入口）、migration matrix、runtime database input、模块边界、尺寸 ratchet 与 `git diff --check` 通过。当前结构矩阵为 32 项 migration、80 张 SQL 表、64 个 Prisma model、16 张 raw-owned 表。

目标仍为此前的 28 项 migration；本叶未执行目标升级、在线模型或浏览器验收。V1—V3 完成只指本叶，不关闭父任务 T03、T01/T02 的目标阶段或完整产品 AC。
