# 竞技场单模型参赛验收

日期：2026-11-12。合同：[自主竞技场规格](../specs/2026-11-12-autonomous-model-arena.md) AC17 及[日频规格](../specs/2026-11-05-model-arena.md)。

## 修改及边界

两版协议的模型绑定数量均为 1 至 12，空列表和重复绑定继续拒绝，其他规则不变。共享表单仅在未选模型时显示“请选择参赛模型”；自主及日频、Desktop 及 Mobile 统一消费。已有多模型协议与历史记录不改写，不自动补充模型。

检查服务端创建、研究准入及领域计算，没有额外的多模型数量门禁需要修改。共享协议负责数量约束，既有按参赛者逐一创建账户、研究和排名的流程保留。

## 定向检查

- schemas：`test/arena-live.test.ts` 与 `test/model-arena.test.ts` 共 9 项通过，单模型有效、空列表及重复绑定无效，原多模型及市场规则保持。
- api-client：`test/arena-setup-validation.test.ts` 最终 6 项通过，包含日频单模型校验和提交、不补模型、未选提示及无效提交不发请求；与预算回归组合的前轮 18 项通过。
- domain：`test/arena-live-valuation.test.ts` 共 4 项通过，单模型净值 110、本金 100 时收益 0.1、名次 1；缺价时仍为空值并暂停排名，固定篮子与多模型缺口回归保持。
- Server／Desktop／Mobile 类型检查、schemas／api-client 构建、Desktop 生产构建和定向 ESLint 通过；边界与 `git diff --check` 通过。既有 Node localStorage 和 Vite 大包提示保留。

## 隔离服务端

维护入口：

`node scripts/test-ai-provider-postgres.mjs test/model-arena/live-research-postgres.integration.test.ts test/model-arena/live-http-postgres.integration.test.ts`

专属临时 PostgreSQL，数据库 `ai_provider_concurrency_fixture`、owner `fixture_owner`，应用实际 51 个迁移；2 文件、15 项通过并清理临时容器。

实际共享客户端经 Nest HTTP 创建单模型草稿，详情只有一个账户，启动／暂停／恢复／结束成功；空模型原始请求仍返回 400。另一个隔离用例完成单模型启动、领取、受控研究和最终预约，只有一个账户及一次受控 SDK 调用。保留原多模型、预算、未知结果、续约及取消回归。SDK 为受控函数，无真实模型或行情出站。

## 两端页面

使用维护脚本，设置 `ARENA_SINGLE_MODEL=1`，覆盖 1440、1024、768、390：

- Desktop：未选模型就地提示；选择一个模型后提示解除，三组研究／预算配置均成功保存，协议和详情只含一个模型，账户显示和直接结束正常；服务端字段错误及失败恢复回归通过。
- Mobile：单模型收益图、图例、触摸、净值切换、账户与直接结束通过；创建时只选 Atlas，保存协议只有一个模型，未选错误解除。旧日频未选提示同步检查。
- 两端零页面错误、无横向溢出。Mobile 使用 RN Web 实际业务组件和受控样本，不代表原生设备或完整宿主验收。

命令为上一轮维护脚本的完整参数组合：`ARENA_OPTIONAL_BUDGETS=1 ARENA_OPTIONAL_REQUEST_LIMITS=1 ARENA_INLINE_VALIDATION=1 ARENA_SINGLE_MODEL=1`（Desktop）；Mobile 额外使用 `ARENA_MOBILE_OPEN_SEASON=1 ARENA_MOBILE_UNLIMITED_BUDGET=1`。脚本分别为 `scripts/local-runtime/arena-optional-dates-browser.mjs` 与 `scripts/local-runtime/arena-live-mobile-browser.mjs`，Playwright 位置仍为 `/tmp/codex-market-range-qa/node_modules/playwright`。

截图位于 `/tmp/arena-single-model-desktop` 与 `/tmp/arena-single-model-mobile`，已查看窄屏单模型收益图。所有业务请求受控，真实比赛数据未写入。

## 目标运行态

从 infra 仓库执行 `./scripts/sync-code.sh thesis-ledger`，兼容预检、构建、传输、重启和健康检查全部成功，退出码 0。Server／Worker healthy，镜像保持 `sha256:8066e62ea225285e281698676d3dfad77a481fa253e24fc235e8e1aa9360764f`；快更位于容器可写层，不代表镜像发布。

Server 容器内只读契约探测：日频／自主单模型均解析为 1 个绑定，两版空列表均被拒绝。宿主和 Server 容器的两个关键产物 SHA-256 一致：

| 产物 | SHA-256 |
| --- | --- |
| `schemas/dist/model-arena.js` | `7dba5e51b29d9bbbb3b35c337aae05eee57677194f87149a2fbeffd477c160dc` |
| `schemas/dist/arena-live-protocol.js` | `7596397622984d23964e438ded65c399cb814a82d54d38528e555e5d727925e4` |

目标目录接口一次只读 GET 为 200，5 场既有记录通过现行契约。没有真实模型／来源调用、真实比赛写入或数据库结构变更。父级原生／完整应用、真实来源及完整恢复门禁独立保留。
