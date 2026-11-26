# Arena 工具能力与回复边界离线修正

## 交付范围

对应[回放规格 AC09](../specs/2026-11-12-arena-replay-live.md)与[活动任务 T2d-C](../tasks/2026-11-12-arena-replay-live.md)。根据[离线请求审计](2026-11-15-arena-request-constraints-offline-audit.md)修正后续研究请求的工具范围，并明确工具请求交付后的等待边界。

2026-11-15 完成源码修改和离线验证。未调用真实模型、访问外部行情或真实业务数据库、加载模型、操作队列、重试比赛、部署、修改模型参数或改写历史记录。本报告不能证明模型推理重复已经消除，也不代表本地运行环境已包含本次修正。

## 实现与约束

### 同一能力定义贯穿请求链

新增 [`live-research-contract.ts`](../../apps/server/src/model-arena/live/live-research-contract.ts)，由 Arena 按周期冻结的协议与 `replay` 构造请求级合同。以共享合同的现有分支派生，保留字段格式、工具数量和完整决策校验，不创建另一套决策定义。

| 场景 | 可请求工具 | K 线／指标周期 |
| --- | --- | --- |
| 回放，网页授权开或关 | 证券检索、报价、K 线、指标 | `1m/5m/15m/60m` |
| 实时，网页授权关闭 | 上述工具及新闻 | 上述周期及 `1d` |
| 实时，网页授权开启 | 上述工具及新闻、网页搜索 | 上述周期及 `1d` |

`financials` 不进入任何当前请求；回放另排除新闻、网页与日线。有效能力表示工具已接入，不承诺每个证券、来源和时点都有资料。原工具读取、历史可见性与执行证据门禁继续独立生效。

[`live-research-messages.ts`](../../apps/server/src/model-arena/live/live-research-messages.ts) 使用该合同生成提示中的 Schema，并将派生的 `capabilities` 加入用户上下文。原始 `protocol.allowWebSearch` 保留比赛授权含义，提示明确实际工具以当前能力为准；没有把原来的 `true` 静默改成 `false`。

[`live-research-call.ts`](../../apps/server/src/model-arena/live/live-research-call.ts) 从周期冻结输入计算同一合同，而不是用当前比赛设置推断旧周期权限。预算预留及模型身份探测之前核对提示中的 Schema，避免文字仍是通用合同、实际请求已收窄。随后：

- 将派生能力与请求输入一并进入后续调用审计；不补写旧审计。
- 原生结构化、文本 JSON 校验和 API JSON 模式均使用相同请求级 Schema。
- 失败诊断也使用本次请求的合同，避免将越界回复误诊为有效。
- 继续沿用原费用、预算、身份、生成上限、超时和结算逻辑。

[`live-research-runner.ts`](../../apps/server/src/model-arena/live/live-research-runner.ts) 在执行工具或提交决策之前再次使用相同能力合同解析回复。即使受控调用替身返回越界对象，也不能进入工具执行。

共享合同版本、通用历史读取结构和旧记录保持原语义；本次未修改 Schemas 公共源码或引入跨领域反向依赖。通用 Schema 保留旧工具分支不代表后续请求仍向模型提供这些能力。

### 一次回复与后续研究的边界

提示词与用户开始指令明确：一次回复只选择 `tools` 或 `decision`。需要资料时只交付工具 JSON，立即结束该次回复并等待服务端 `toolResults`；工具分支不需要决策或预约字段。只有决策分支才提交完整决策与未来预约。

继续使用现有应用 JSON 工具协议，没有切换到原生 `tool_calls`。研究编排原有的 `await` 工具结果语义保持；通过受控未完成工具验证，在收到结果前不进行下一次生成、不提交决策。工具不可用时也先把明确的不可用结果交回模型，再继续研究，不伪装成已获得证据。

## 离线验证

所有测试均使用本地固定输入、数据库替身、模型替身或注入的内存 HTTP 响应。新增 SDK 用例将全局 `fetch` 替换为一旦调用就抛错的函数，实际请求只被注入的 `httpClient` 捕获；地址使用 `https://offline.invalid/v1`，不会连接模型服务。没有运行需要隔离数据库、真实队列或外部服务的验收入口。

### 最终结果

| 检查 | 结果与适用范围 |
| --- | --- |
| Server 定向回归 | 10 个文件、70 项通过；含能力、消息、调用投影、等待边界、工具、额度、费用、诊断与 Schema 提示 |
| Schemas 合同回归 | 2 个文件、12 项通过；保留现有决策及附属委托合同 |
| Server `typecheck` | 最终通过，包含本次新增测试 |
| Domain／Schemas `build` | 通过，用于同步本地工作区编译产物，不更新运行环境 |
| Server `build` | 最终通过，未制作镜像或同步容器 |
| 定向 ESLint／Prettier | 通过；原有紧凑消息与编排文件按原风格局部修改，未进行无关整文件格式化 |
| 依赖边界／文件尺寸 | 通过；无新增例外或阈值调整 |
| 文档链接／diff 空白检查 | 通过 |

关键覆盖：

1. 回放／实时与网页授权开／关四组能力矩阵；两种阶段都排除财务，回放排除日线、新闻和网页，实时保留原有正常能力。
2. 四组上下文乘三种生成模式，捕获真实 SDK 构造的内存请求。原生请求的 Schema 与提示 Schema 只有 SDK 既有的草案声明差异，结构一致；未发送另一套原生工具定义或停止串。
3. 每种模式正常接收合法工具 JSON，拒绝越界财务请求，以及同一回复中串联工具 JSON 与决策 JSON；外联替身调用数为零。
4. 工具分支可独立交付；混入决策字段拒绝；决策缺少预约拒绝；每次工具数仍为 1–5。
5. 当前比赛的网页开关变化不会扩张或收缩既有周期冻结的网页授权；回放也不受网页授权开启影响。提示合同漂移时在身份探测、预算预留和 SDK 调用前拒绝。
6. 通过显式未完成的工具 Promise 检查等待期间调用次数仍为 1；工具成功或失败返回后才产生第二次调用，并携带真实 `toolResults` 与原回放时点。越界或混合回复不会调用工具、预留工具预算或提交决策。

### 最终命令

执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`。Shell 均通过 `rtk proxy`，包管理器为 `/Users/yzin/.volta/bin/pnpm`。

```sh
pnpm --filter @thesis-ledger/domain build
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/server exec vitest run test/model-arena/live-research-contract.test.ts test/model-arena/live-research-boundary.test.ts test/model-arena/live-research-call-projections.test.ts test/model-arena/live-research-messages.test.ts test/model-arena/live-research-tools.test.ts test/model-arena/live-call-cost.test.ts test/model-arena/live-call-limits.test.ts test/model-arena/live-call-diagnostics.test.ts test/ai/ai-generation-schema-prompt.test.ts test/ai/ai-sdk-generation-adapter.test.ts
pnpm --filter @thesis-ledger/schemas exec vitest run test/arena-live.test.ts test/arena-contingent-orders.test.ts
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/server build
node scripts/check-boundaries.mjs
node scripts/check-file-size-guardrails.mjs
```

ESLint 覆盖四个实现文件与三个测试文件；Prettier 检查新增文件、调用文件及本次调整的测试文件。所有校验针对未提交的共享工作区，不宣称检验了干净提交。

### 已处理的验证失败与并行输入

- 第一轮内存拒绝用例使用了非 UUID 的测试请求标识，错误事实构造先拒绝该标识。改成有效受控 UUID 后，正常与越界响应验证通过；未改生产错误契约。
- 动态工具列表初版没有为 Zod 表达非空元组，类型检查拒绝；改为显式检查首项并构造非空元组，未使用忽略或降低类型检查。
- 初期共享源码已有 `matching/exitGroup` 改动，而本地依赖声明仍旧；按拓扑构建现有 Domain／Schemas 后消除。其后并行源码新增 `entryAfter` 再次引发声明不同步，重新同步实际已变化的产物后，最终完整类型检查与构建通过。
- 一次完整构建被另一项未提交的 `live-partial-postgres.integration.test.ts` 中 `latestCompletedTradingDate=null` 阻断。该并行测试随后自行改变，本次未修改它；在输入变化后重新执行完整构建，最终通过，没有排除文件或建立特殊构建配置。
- 修正本次测试中的格式与 `prefer-const` 问题，最终定向检查通过。没有因这些离线失败发送模型请求。

## 最终一致性检查与剩余门禁

本次离线交付通过：能力投影、提示、发送与本地校验一致，等待边界及正常决策语义得到受控验证；原 WIP、历史数据与授权范围保留。写集仅四个 Arena 源文件、三个测试文件及 Spec／Task／本证据；没有依赖、数据库结构或部署变更。

本报告记录的离线阶段尚未部署；后续经用户授权完成的本地部署另见[部署证据](2026-11-15-arena-tool-capability-local-deployment.md)。真实模型是否停止循环、恢复比赛并追平至实时，以及真实历史成交规则仍未验收，继续由活动任务 T2d 持有。当前禁止调用模型和重试比赛的限制保持有效，不将 82 项离线检查当作真实模型或比赛验收。
