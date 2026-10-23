# AI 保存与默认引用 PostgreSQL 竞争验收

## 范围与基线

本轮完成[测试后保存 T6.P1](../../archive/tasks/2026-09-23-ai-provider-auto-test-save.md)与[默认引用 T4.2.P1](../2026-09-21-ai-provider-model-usage-configuration.md)两个独立叶。主仓 HEAD 为 `514abeebfe57bac0c16271439d8b777ff3b02a9f`，在保留上一轮未提交文档改动的工作树验证；本轮实现也未提交。Node 为 `24.18.0`，pnpm 为 `11.9.0`。相邻 DSA/infra 仓保持干净。

数据库为独立 `postgres:17-alpine` 临时容器，使用 tmpfs，不挂载业务 volume；仅映射 `127.0.0.1` 随机端口。数据库身份固定为 `ai_provider_concurrency_fixture` / `fixture_owner`，运行入口和夹具均核对身份。按目录排序执行当前全部 26 个 migration SQL，执行后运行测试，结束自动移除本轮容器。未改 Schema、migration、依赖清单或目标容器。

数据库、Prisma 持久化、Provider/默认服务、两个独立 Nest HTTP 实例与 Controller/异常过滤为真实实现；SDK 生成只返回受控样例，不连接模型。本轮不验证外部认证、费用、SDK 网络传输或最终业务研究结果，也不验证 app role 与目标部署权限。

## 发现与修复

初始保存竞争 4 项通过。默认设置与停用、删除、移除研究用途的 3 项锁竞争用例失败：候选检查与默认提交分离，修改已进入持久化但被行锁阻塞时，默认设置仍独立返回 200，无法保证提交后引用有效。原事务回滚及设置 CAS 的局部验证不能覆盖这个窗口。

AI 配置事务边界现统一默认选择、Provider 保存与生命周期操作，使用同一 PostgreSQL 事务级 advisory lock；在临界区重读候选和默认引用，再执行版本检查及提交。锁同时覆盖首次无 `global` 记录的设置，不在锁内进行模型验证。通用 Provider 存储支持调用方事务客户端，仍单向由 AI 消费；边界检查加入事务模块不能反向依赖应用编排的约束。

补充保护：停用研究用途不列为默认候选；普通保存不能绕过默认 Provider 的停用确认；带旧版本的删除后草稿不能重新创建配置。已有用途成功审计在保存冲突后仍可由新服务实例复用，不追加模型调用。

两个过大存量文件按语义收敛：生命周期事务移入 AI 所有的持久化边界，管理测试的事务夹具移入已有 fixture。未提高尺寸/复杂度阈值。

## 实际验证

| 检查 | 命令或入口 | 结果与边界 |
| --- | --- | --- |
| 初始定向回归 | Server vitest：verified-save、management、routing-settings | 52 项通过，先确认当前局部基线 |
| 修复后定向回归 | 上述三文件加 `test/providers/services.test.ts` | 63 项通过；存储替身仍仅证明局部行为 |
| 相关包级回归 | `pnpm --filter @thesis-ledger/server exec vitest run test/ai test/providers test/strategy-optimization/ai-provider-strict-routing.test.ts` | 225 通过 / 32 跳过；其中本轮 15 项数据库用例在独立入口执行，另外 17 项执行状态/恢复/查询数据库门禁未重跑 |
| 独立 PostgreSQL/HTTP | `node scripts/test-ai-provider-postgres.mjs` | 最终 15 项通过：保存 5、默认引用 10；两个测试文件顺序运行以隔离全局默认夹具，每个文件内部仍通过独立客户端制造竞争 |
| Server 类型 | `pnpm --filter @thesis-ledger/server typecheck` | 通过 |
| Server 构建 | `pnpm --filter @thesis-ledger/server build` | 通过；不代表目标容器更新 |
| 受影响 TypeScript lint | `pnpm exec eslint`，本轮 9 个 Server 源码/测试文件 | 通过；脚本按仓库配置被 ESLint 忽略，运行入口另经 `node --check`，边界脚本实际执行 |
| 源码/包依赖门禁 | `node scripts/check-boundaries.mjs`、`node scripts/check-workspace-dependencies.mjs` | 通过，8 个包 |
| 复杂度与尺寸 | `node scripts/lint-workspace.mjs --guardrails`；`GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` | 8 组 / 1420 文件检查通过；10 个存量尺寸 warning，ratchet 通过，未调阈值 |
| 文档链接 | 全部 `docs/**/*.md` 本地链接与锚点扫描 | 707 个 Markdown、1648 个链接、7 个锚点，错误 0 |
| 差异卫生 | `git diff --check` | 通过 |
| CI 接入 | `.github/workflows/ci.yml` 新增独立隔离 PostgreSQL 步骤 | 已接入运行入口；远端 Checks 未运行，不宣称完整 CI 通过 |

保存 5 项覆盖：同名首次创建、同版本编辑、跨服务同操作 UUID 单调用、成功验证后的 CAS 冲突与新实例审计复用、删除后旧草稿禁止重建。默认引用 10 项覆盖：同设置修订竞争与排序稳定；停用/删除/移除用途先进入持久化时默认选择必须重读并拒绝；设置默认先进入临界区时无确认删除冲突；清除默认后的 CAS 零更新与实际数据库写入失败均完整回滚；停用用途与普通保存保护；停用/删除确认及设置版本保护。

## 最终 Review 与剩余门禁

规划及最终一致性 Review 通过：当前原 Spec 断言由两个原 Task 的子叶拥有，保存竞争与默认引用分别有真实数据库证据；其他验收责任保留，未迁入 TODO，原 Task 不归档。首轮夹具的启用继承、缓存污染、数据库启动探测以及两个文件并行清理造成的失败均修正后重新验证，不作为产品失败或通过证据。

完整 T6、G2/G5 与完整 AC-17～21、AC-28 仍未关闭：研究提交修订/冻结竞争、目标 Server 配置回归、真实 Provider 认证/非零计费、浏览器/Electron、新版完整超时/取消和完整远端 CI 保留各自门禁。本轮未同步目标应用、调用真实 Provider、修改业务默认或研究数据，也未提交/推送。后续按原 Task 选择一个独立叶，不自动继续第三项。
