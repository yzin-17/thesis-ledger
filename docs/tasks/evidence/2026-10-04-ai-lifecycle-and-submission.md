# AI 验证生命周期、研究提交与独立进程恢复

## 范围与依赖

对应自动测试保存 T6.L1、模型用途配置 T4.2.P2、研究工作台 R1。原完整 AC 和目标运行时、真实 Provider、认证/非零费用、Electron 门禁分别保留。此前保存及默认引用的 15 项数据库证据为依赖，本次新增创建竞争和独立进程验证。

## 用途验证生命周期

真实锁定 SDK 与本机 HTTP/SSE 的 6 项通过：持续输出超过 Provider timeout 仍保存且用量 reported；首输出停顿、输出间隔停顿均按 provider_timeout 失败；300 秒操作信号到期按 operation_timeout 中断；用户取消记录 validation_cancelled；非流式连接受 Provider 总超时约束。每个实际场景只发起一次请求，失败不继续格式回退、不保存配置。

300 秒测试保留实际配置和授权计划的 300 秒值，只将该 AbortSignal 定时器加速为 80ms；使用真实网络与中止信号，属于加速生命周期验证，不声称已等待 300 秒墙钟时间。用途探针的固定 Token 上限、费用授权及正式研究/优化政策未改。

初始回归复现操作总期限被解释成用户取消，以及取消审计使用通用 validation_failed 的缺陷。修复由 AI 模块的中止归因 helper 负责，保存前和用途调用前后统一检查；已知用量继续保留。验证失败分类提取为领域函数，移除原嵌套三元，未新增通用 shared/utils。

`vitest run test/ai/ai-provider-validation-lifecycle.integration.test.ts test/ai/ai-provider-verified-save.test.ts test/ai/ai-provider-onboarding-http.test.ts`：3 文件、32 项通过。

## 研究提交竞争

专用数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`、localhost 临时 PostgreSQL 17、tmpfs 与全部 26 migration。两个独立 Nest HTTP 实例使用真实配置服务、Prisma 和 AiRunService；固定 SDK 只验证配置，不调用模型。

- 缺少默认返回 400；默认变更后的过期 revision 返回 409；两者都不创建任务。
- 创建冻结唯一 Provider/Model、价格与设置修订；后续默认/排序变化不改写旧任务。
- 真实表锁阻塞 AiRun INSERT，复现默认变更可以越过未提交创建的竞态。修复后默认读取、版本校验、路由冻结和 AiRun 创建共享既有 advisory 配置事务；创建先进入则切换等待，切换完成后旧修订新请求返回 409。事务不包含模型调用。

`node scripts/test-ai-provider-postgres.mjs` 扩展后的最终执行：4 文件、21 项通过（保存 5、默认引用 10、研究提交 3、独立进程 3），临时容器已清理。入口在独立进程场景前构建当前 Server/依赖，避免复用陈旧 dist；同一入口进入 CI，远端 Checks 未运行。

## 独立进程恢复

新 Node 进程使用真实已构建 AiRunService/AiExecutionStateStore 和隔离 PostgreSQL。queued、prepared、dispatched 三种场景分别持久化后 SIGKILL，由不同 PID 恢复：

- queued 可继续领取为 attempt 1。
- prepared 失租后以 attempt 2 领取；旧 attempt 1 的发送授权被拒绝。
- dispatched 失租后 failed/research_unknown_outcome，不再领取，不重放 Provider，旧代次提交被拒绝。
- 无结果、执行读模型 usageCompleteness=unknown，未收到用量的请求 usage=null。旧聚合列的数据库默认 0 不作为 reported 用量事实。

这是隔离核心服务进程证据，没有重启目标中的在途真实研究；原目标服务与真实 Provider 重启 smoke 仍未完成。

随后补强 dispatched 场景：本机 HTTP 固定输入服务实际收到该 run 的唯一 POST 并保持无响应，确认收到后才 SIGKILL；不同 PID 恢复后仍只收到 1 次请求。定向入口 `node scripts/test-ai-provider-postgres.mjs test/ai/ai-research-process-recovery.integration.test.ts`：3 项通过，使用当前编译产物、全部 26 migration 的隔离 PostgreSQL，临时容器已清理。这验证实际传输后的未知结果不重放；固定输入服务不是目标真实模型，未声称完整研究执行器的真实 Provider 重启通过。

## 目标环境与发现

通过官方 `sync-code.sh thesis-ledger` 更新了生命周期和提交修复，Server/Backtest Worker 均曾健康；该更新为可写层，不构成镜像发布。当前研究默认仍为 null，未写入目标选择。

现有 lmstudio 配置为无认证、目标模型双零费率。唯一实际用途测试 requestId `af19a83d-4805-4471-939f-489d9a0880f6`，10.73 秒后连接 `192.168.5.20:6789` 超时，返回 provider_timeout；usage、cost 均 unknown，未自动重试。历史成功证据不能证明当前连接成功。

目标空默认提交返回预期 400 后，Node 24 进程退出。日志定位到控制器对 rejected 创建 Promise 附加无 catch 的 then/dispatch，产生未处理拒绝。修复为单一 await 创建后再投递的研究入口；保留其他入口的同步校验语义。新增 2 项控制器用例覆盖失败不投递、成功后只投递该 ID。完整 AI 回归 27 文件通过、8 文件跳过，217 项通过、38 项跳过，无未处理错误。

由于目标 Server 已退出，按 infra 规则改用 `./scripts/update.sh thesis-ledger` 完整更新。首次因沙箱不能写 `~/.docker/buildx/activity` 而未开始构建；同一官方命令获扩展权限后成功。Server/Backtest Worker 均运行新镜像 `sha256:27dfa6a8aa364abf0eacf21a793a2ecfb4f95a579d0285bd7aabcbb143744426`，healthy、restart=0；结构 head 为 `20261001120000_require_explicit_strategy_contract`。

恢复后连续 3 次目标 POST `/ai/runs` 均返回 400「请先选择研究默认模型」，每次随后 `/health` 为 healthy；任务历史原始响应 SHA256 前后相同，未创建任务。请求后两容器仍 running/healthy、restart=0，启动后日志无未处理拒绝。研究默认仍 null/revision 0。两个旧验收 Ledger 的 events SHA256 与组合估值证据中的基线完全一致。该结果完成空默认拒绝入口的目标复验，未替代在途真实研究重启。

## 质量门禁与边界

- Server 全包基线：255 文件通过、40 文件跳过；2,080 项通过、167 项跳过。随后控制器修复另经上述完整 AI 回归；条件式数据库跳过不计通过。
- 当前 Server typecheck、领域边界、工作区依赖、HEAD 尺寸 ratchet、变更文件 lint/Prettier 和 git diff --check 通过；研究默认单元测试按提交职责提取，存量 services 回调由 337 行缩至 275 行，未提高阈值。
- 当前完整 `pnpm lint` 通过：9 组、1,436 文件，包含工作区构建、边界和依赖检查；控制器最后修复另经定向 ESLint/typecheck 与完整 AI 回归。远端 CI、真实认证、非零费率与 Provider 实际账单、Electron 仍开放。
- 目标研究默认需用户显式选择，且 lmstudio 连接尚不可用；未为了运行 smoke 设置默认。无交易或账本写入，无提交或推送。
