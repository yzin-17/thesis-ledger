# 三项 P0 正确性修复的目标验收证据

> 日期：2026-10-19（Asia/Shanghai）；结论：RVCG、IVAG、PFCG 均通过各自约定的目标消费门禁。全程由主线程执行，真实模型继续暂停。各领域状态仍由原 Task 持有。
> [风险 Task](../2026-10-18-risk-valuation-correctness.md#rvcg) · [指标 Task](../2026-10-18-indicator-availability-correctness.md#ivag) · [收益 Task](../2026-10-18-performance-correctness.md#pfcg) · [原始运行报告](2026-10-19-p0-target-acceptance.json)。

## 授权与验收范围

用户本轮明确授权按优先级完成三个 P0 目标验收、通过正式脚本更新目标并保留现有数据，同时继续暂停真实模型。目标为既有 `thesis-ledger-dev`。实际业务代码在更新后的 Server/Worker 容器内执行，写入专属临时 PostgreSQL；浏览器读取同一目标容器内装配的真实收益 HTTP 服务。测试未写用户账户、持仓、目标、风险规则或生产快照。

价格、FX、NAV、回测来源材料及现金流为明示合成输入，控制的只是来源输入和一次传输故障，业务计算、规则、状态机、ORM、HTTP、响应解析及客户端组件均使用实际实现。通知只捕获、不外发。此结果不授予来源资格，不替代 DSA 实源、研究真实模型、完整双读、恢复或其他原 Task 的独立门禁。

## 正式更新与候选身份

在相邻 infra 仓执行一次正式更新，退出码为 0；未使用开发清库路径，后续验收重试复用同一镜像：

```sh
cd /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra
rtk proxy env DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh thesis-ledger
```

完整输出保存在 `/tmp/thesis-ledger-p0-formal-update.log`。正式保留升级产物位于 infra `.database-upgrades/run.OKALSe/`，包含原库备份、恢复演练、升级计划和执行记录：

| 核对项 | 实际结果 |
| --- | --- |
| 数据库 / owner / app role | `thesis_ledger` / `thesis_ledger` / `thesis_ledger_app` |
| 停消费者 / 完成备份 | `2026-10-19T13:10:34.218Z` / `13:10:34.915Z` |
| 隔离恢复 / 升级 / 校验完成 | `13:10:39.357Z` / `13:10:43.334Z` / `13:10:47.104Z` |
| 备份 | 3,862,181 字节；SHA-256 `cabe0e8c800e89f5ab0a8798487e4c4af5d0888dc57bf87116dcb900c27a8b1f` |
| 恢复前后结构 head | 均为 `20261019020000_research_observation_versions`，共 35 份迁移输入 |
| 正式演练检查 | `structureComplete=true`、`appRolePermissions=true`、`preservedData=true` |
| Server / Worker 镜像 | 均为 `sha256:c1f3c9d890e17f6ffa827aae9c80a8b21fd53e4d37d08ed4a51a3f3de8187eac` |
| 当前源码对应运行产物 | 883 个文件逐字节匹配宿主新编译产物、Server 与 Worker；汇总 SHA-256 `275025e50797867df5eafd4aaafc65eb1d7bdd62fa651df79477de8bcc19f5ef` |

宿主旧构建目录有 11 个已无当前源码的孤立输出，原始报告逐项列明；候选校验按当前源码枚举应有产物并校验编译时间，不把旧输出要求强加给新镜像，也未跳过任何当前源码对应文件。没有删除原工作树文件或放宽运行门禁。

## 既有数据与资源保护

正式更新前基线保存在 `/tmp/thesis-ledger-p0-before-20261019.json`，原文件保持不变。正式更新后和全部验收结束后都完成核对：78 张业务表、36,537 条原业务记录、642 个生产快照文件保留，最终 `additions={}`。比较保留原行重复次数，不能以新增行掩盖原行丢失；快照同时核对路径和内容。

其中 `AutomationJob` 的 5 条记录另与正式停消费者后备份核对：只允许 `valuation-intraday-sample.nextRunAt` 调度游标单调推进，其余业务字段和配置逐项一致。原始报告的 `operationalCursorAudit` 明示唯一差异及备份 SHA；其余 77 张表仍使用更新前原始完整行摘要。没有整表忽略，也没有用更新后的状态覆盖原基线。正式完整数据库备份另外保留全部数据库内容。

PostgreSQL、Redis、DSA 原挂载按目标路径归一化比较后保持相同。验收侧库使用 tmpfs、独立数据库、专属凭据及快照临时目录；入口持有与正式维护共享的更新锁。终态检查通过后只删除自己的 sidecar、进程和目录，不删除既有 volume 或挂载。

## RVCG：目标风险消费

实际目标 Server 中的 handler、估值服务、Risk 规则和状态机、事件及 Automation 历史链全部消费合成输入，在专属数据库落库，共六组结果：

- 100 USD 和 700 CNY 按汇率 7 换算后各为 50%；独立账户仍为 100%，实际规则产生风险事件。
- 缺价、缺 FX 时既有活动风险事件和状态保持，相关组合权重不伪造；独立账户及不依赖该权重的价格规则继续评估，历史保留不可用原因。
- 陈旧、未来、未知行情及陈旧、未来、未知年龄 FX 不获得可用权重；完整单币账户独立可用。
- 真实/模拟持仓分开估值；零分母保持未知。
- 正式 NAV 消费入口的受控正例可用；陈旧、不可用 NAV 及币种不匹配保持未知。
- 外部通知投递为 0，真实模型调用为 0；原生产风险记录由数据保护摘要另行核对。

RVC-AC5 和 IR02 的独立关闭对账通过，实际市场来源资格仍按原来源合同维护。

## IVAG：目标 Worker 计算身份与冻结保护

`scripts/p0-target-inputs.mjs` 使用实际构建器和既有纯夹具生成两个来源输入带，分别覆盖 RSI（嵌套 EMA）及 ATR。输入包 68,898 字节，SHA-256 为 `25f3f94447327a44d2a3ed3857579780b3796d9c82d8aad7313da5add0fb7a1a`。这不是最终业务结果 mock，也没有进行实源请求。

实际目标消费者拒绝 RSI/EMA 晚到种子及 ATR 晚到前收，批量与单 tick 结果一致。两条完整路径均在目标 Worker 执行 `DsaSnapshotBuilder → 冻结快照 → LocalSnapshotV3Runner → runBacktestAttempt → PostgreSQL succeeded`；离线重放一致，没有额外来源读取。

每种输入同时验证旧 queued/succeeded/failed/cancelled Run：不重新执行旧结果，旧引擎、结果、校验和及冻结材料保持；不兼容 queued Run 以 `INDICATOR_ENGINE_VERSION_CHANGED` 收敛。计算身份为 `thesis-ledger-v3-local-runner-v3`，缓存仍限于单次计算，冻结哈希继续只表示输入。生产原 71 个 Run 和 642 个快照文件另由保留对账保护。IVA-AC6 通过。

## PFCG：目标 HTTP 与实际浏览器

目标 Server 内独立装配真实 PerformanceController、Service、Analysis、Target、Snapshot 和 Prisma，共五组后端结果：

- 保存/读取目标成功；非法范围返回 400，原活动版本保留。
- 六个并发 HTTP 保存得到连续版本 1～6，活动版本唯一。
- 缺少现金流边界、净额为零但存在流量时，TTWROR 保持不可用；XIRR 独立判断。严重亏损结果有限并满足现金流方程，读取不改写原快照。
- 精确分段输入得到 10% TTWROR；再平衡保留现金来源，partial 输入拒绝建议。
- 通过实际 `CashLedgerCommandService` 和 `LedgerV2Repository` 写入当前信封版本 3 的现金输入，实际 layers/targets HTTP 正向读取，余额为 100 CNY。未降低旧信封拒绝条件。

浏览器入口直接组合现有 `PerformanceDashboard`、模式切换、TanStack Query、目标编辑器及生产所需 Provider，通过回环代理访问上述目标 HTTP；没有预制响应。实际操作与刷新结果如下：

| 操作 | 实际可见结果与服务端读回 |
| --- | --- |
| 选择现金流账户 | 现金 100 CNY；TTWROR 为 `—` 并说明缺少流前/流后边界；XIRR 为 12.73%；目标 v1 为 50%/50% |
| 改为 60%/40%，一次保存注入 503 | 显示 `ThesisLedger API 503`；编辑器及 60%/40% 草稿保留；HTTP 读回仍为 v1 50%/50% |
| 再次保存 | 实际 POST 返回 201，目标 v2 为股票 60% / 现金 40%；编辑器关闭并重新读取活动版本 |
| 切到模拟模式 | 真实账户选择、结果与目标版本立即清除；已知空模拟组合为 0，收益未知，未残留真实账户结果 |
| 选择严重亏损账户 | TTWROR −90.00%，XIRR −90.02%（原始值 `-0.9001575870087339`），有限且未显示错误零值 |
| 完整刷新后重选现金流账户 | v2、股票 60%、现金 40%、边界原因及 XIRR 12.73% 均仍可读取 |

原始报告的 `browserTransport.successfulSaves=10` 是当时将 allocation POST 也计入的宽计数，保留原报告以避免改写运行历史。收口时已修复维护入口，只统计 `/api/v1/performance/targets`；以原始 `bridgeTrace` 重算严格结果为受控失败 1 次、成功保存 1 次。新增定向测试拒绝把 allocation 成功或其他路径故障计入。本修正仅影响统计，不修改实际目标执行、浏览器操作或截图，不需要重建镜像或重做已过业务验收。

本机截图、刷新 AX 文本与临时浏览器装配源码已保存在 `/Users/yzin/.codex/visualizations/2026/10/18/01a14fb4-30c5-7e03-b533-c767eb27efe1/p0-acceptance/`：

| 文件 | SHA-256 |
| --- | --- |
| `thesis-ledger-p0-target-save-failed.png` | `2ed8e5052186acae66b1230d7393aed3fca8aec52e2156d639b371d32ec08420` |
| `thesis-ledger-p0-target-saved.png` | `002fb6a1625f01e45976e4b36a29094097619a45c0b973561207af0a6d0f1204` |
| `__codex_p0_performance.html` | `017d78558443897b9bcc71a170362e7cf8d6d1643f615479e47053d7a2ae3d80` |
| `__codex_p0_performance.tsx` | `385f2f607ad8a474376c841da9d2eebe14d5ab17289fd0346c536d8793aa8aae` |
| `__codex_p0_vite.mjs` | `516fb9cfafe79900d5b73f03df86285cbebd6b43bfc6857c1254783288b8c1f6` |

临时入口已从产品目录移除，测试 Vite 和浏览器页已关闭。PFC-AC6 的保留更新、目标实际消费和浏览器消费分别通过，原收益 G1 及其他快照验收仍沿各自未变输入复用。

## 复跑入口与验证记录

本轮维护代码在主仓 `scripts/p0-target/`、`scripts/p0-target-inputs.mjs` 和 infra `scripts/p0-target-{acceptance,runtime,contract}.mjs`。主仓唯一已有测试装配改动为收益 HTTP 夹具返回独立服务 `origin`。

```sh
# 主仓生成明确的来源输入
rtk proxy pnpm --filter @thesis-ledger/server exec tsx --tsconfig tsconfig.json ../../scripts/p0-target-inputs.mjs /tmp/thesis-ledger-p0-target-inputs.json

# infra：更新前基线必须使用新路径，已存在的证据不得覆盖
rtk proxy node scripts/p0-target-acceptance.mjs baseline /tmp/thesis-ledger-p0-before-20261019.json

# infra：使用正式更新产物；每次 run 使用新的报告路径
rtk proxy node scripts/p0-target-acceptance.mjs run /tmp/thesis-ledger-p0-before-20261019.json /tmp/thesis-ledger-p0-target-inputs.json /tmp/thesis-ledger-p0-target-run-6.json /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.database-upgrades/run.OKALSe
```

`run` 输出本次回环服务及专属账户；浏览器临时装配的 Vite 配置只接受该回环服务。`POST /__p0/fail-next-target-save` 只注入下一次独立目标保存故障，`POST /__p0/finish` 触发保护核对和自己资源的清理，均属于维护入口，不是产品 API。

| 层级 | 最后结果 |
| --- | --- |
| infra 维护合同 | `node --test scripts/p0-target-contract.test.mjs`，6 项通过；包含严格浏览器统计 |
| 隔离 PostgreSQL / HTTP / Risk | `node scripts/test-performance-correctness-postgres.mjs test/risk/valuation-postgres.integration.test.ts`，3 文件 12 项通过 |
| Server / 夹具 | 类型检查、构建、夹具严格 lint 通过 |
| 工程输入 | 主仓边界、运行时数据库打包输入、基于 HEAD 的复杂度 ratchet 通过；10 个新增维护脚本语法检查通过 |
| 正式更新 | `update.sh thesis-ledger` 退出 0；备份、恢复演练、权限、结构和保留核对通过 |
| 最终目标运行 | `run-6` 从 `2026-10-19T13:36:04.855Z` 到 `13:48:05.862Z`；退出 0，`cleaned=true`，无 failure |
| 最终运行态只读复核 | `2026-10-19T13:55:05Z`：Server/Worker 均 healthy、镜像一致，启动后日志缺表/缺列错误 0；API health 200、数据库/Redis/DSA healthy；本轮进程和 sidecar 均 0 |

早期验收重试的报告保留在 `/tmp/thesis-ledger-p0-target-run-*.json`，未覆盖失败证据。已解决的问题为 Docker 挂载顺序、合法调度游标、选表备份流的受控 EPIPE、宿主孤立编译输出及测试现金流夹具版本；最终以当前现金命令生成有效正例，没有降低生产账本或历史保护合同。没有为重试重复构建目标镜像。

三仓现有未提交修改保留，未 stage、commit、push、tag 或创建 PR；真实模型、真实生成、Provider 启用和路由变更均未执行。全仓 lint 的既有三处无关错误仍按原证据保留，不由本次目标通过抹除。P1/P2/P3 的外部来源、恢复、研究闭环与模型门禁继续由原 Task 持有。
