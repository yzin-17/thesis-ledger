# 编写执行与调用事实隔离验收

当前实现提供专属编写队列、Server 内独立执行组件，以及可信身份下的操作提交、读取与取消。队列只携带操作 UUID；数据库状态和 attempt 决定业务终态。研究 `AiRun`、默认研究模型和研究执行回退不参与本链路。

## 实际隔离链路

维护入口：`IDENTITY_ISOLATED=1 AUTHORING_WITH_REDIS=1 node scripts/test-journal-review-postgres.mjs test/identity/identity-postgres.integration.test.ts test/strategy-authoring/authoring-execution.integration.test.ts`。本轮明确开启两个隔离环境开关，避免将条件跳过计作通过。

入口新建 PostgreSQL `journal_review_fixture`、owner `fixture_owner`，测试使用受限 `fixture_app`；执行全部 31 项 migration，head 为 `20261005140000_authoring_execution_state`。另新建 Redis，使用随机 UUID 队列范围。真实 Nest HTTP、BullMQ Worker 和 SDK stream 消费本机受控 HTTP Provider。Provider 就绪证明由夹具提供，这不是在线模型用途验证。

双用户 HTTP、实际数据库和调用审计共 10 项通过。主要断言如下：

- 重复提交返回同一操作，只发一次模型请求；请求实际使用指定模型。跨用户读取和取消返回 404，owner/费用注入被拒绝。
- 原始格式错误仍保留收到响应、实际用量和费用事实；不自动重新收费，不改写草稿。未知费用须明确确认，调用后金额和币种仍为空。
- 实际断开应用 Redis 命令连接后，新操作返回 503，数据库不产生付费意图。队列查询失败不能当成任务缺失；该场景通过明确查询错误注入验证。
- 未派发意图最多补投两次，投递持续失败后数据库收敛为 failed/not_sent；该场景使用真实数据库和队列缺失查询，并受控拒绝投递。运行中失租任务不进入自动收费补投。
- 两个执行器同时读到 queued 状态时，只有一个领取成功；领取冲突不请求用户取消，最终只调用一次模型。
- 数据库真实领取竞态、排队取消、在途取消、续租总期限及过期通过。业务失租后晚到调用事实仍可追加，旧未知记录保持不可变。

本轮隔离容器均由维护入口清理。Redis 故障为应用命令连接中断，未宣称已执行目标 Redis 服务停机或目标进程硬杀。

## 本地门禁与剩余边界

三种编写用途合同分别通过受控实际 HTTP Provider 请求；定向合同/身份 5 项、调用事实/操作仓储 9 项、Desktop Provider 消费 35 项通过。Server typecheck、直接 lint、模块边界、runtime database input、尺寸 ratchet 及 migration matrix 通过；结构矩阵为 80 张 SQL 表、64 个 Prisma model、16 张 raw-owned 表。Server 及依赖由隔离入口构建。

BullMQ 仅允许编写 queue/worker 两个适配器文件导入，执行器和持久化仓储不直接消费队列 API。首次心跳失败后保留周期重试；领取冲突不会误取消竞争者，数据库错误继续暴露。

目标 Docker 仍为 28 项 migration 的先前部署基线，三个新增结构尚未发布。在线 Provider、目标恢复、结果转换、正式保存和客户端消费继续独立验收；本证据不关闭完整 T02/T03/T05 或产品 AC。A5 保持开放。
