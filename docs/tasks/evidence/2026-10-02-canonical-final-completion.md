# Canonical 最终收口证据

2026-10-02 用户授权完成全部剩余任务。按[连续执行包](2026-10-02-canonical-final-execution.md)完成 U01、U02、E04-d/E04、D01–D03 与最终一致性 Review；验收基线是完整 Canonical Spec。当前架构与 API 归属见[当前运行链](../../architecture/canonical-runtime.md)。

## 剩余实现

- U01：共享 Schema 严格解析 Provider Registry、Policy Desired/Effective、目录状态和 Provider 控制响应；API Client 绑定 Run/Provider 身份。Desktop 删除宽松控制 DTO 和空集合成功回退，当前路径及中文状态统一。连接测试须实际执行真实能力才显示通过；旧 Run 的 409 显示格式或冻结校验拒绝。目录任务继续绑定 ID、ACK 和成功投影，错误或终态停止轮询。
- U02：Risk 净值经当前 Market Reader 校验标的和评估时间，删除历史表旁路；覆盖不足不补持有期数。Optimization 分组只查询当前模式并经完整冻结守卫过滤；旧与损坏结果不生成指标。SSE 摘要资金只取当前 RunConfig 本币金额，移除历史资金字段/首币种回退。Portfolio、Performance、Risk/Automation、Research/AI、Journal、Import、导出/备份的生产调用按 C01 清单及当前边界复核；没有另一条旧创建、行情或账本读取路径。
- E04-d：删除无消费者的 DSA `_provider_name`、旧 Bar/分钟 Bar 夹具；当前依赖事实与可交易性来源按领域重命名，不保留旧模块/类型/响应别名。DSA 当前算法、精确来源、原文和 version 3 保持。
- D03 最终跨包复核发现独立 `services/dsa-adapter` 的历史 Quant 声明、Quote/Bar 路由、合并器和专业插件仍引用已删除的 V1 Schema，且只有本包测试调用。删除这些源文件、旧测试、导出及生成残留；保留独立凭证加密与日期计算原语及原测试。边界门禁新增退役 Market V1/Quant 合同检查。实际 Provider 适配仍由 DSA 拥有，没有修改依赖清单或运行时来源。
- 当前策略 AST、经济 payload、原生单位/映射格式、来源修订和冻结算法标识均逐项保留并说明完整性用途，见架构页；历史 migration、来源原文和旧业务行没有改写为当前格式。

## 最终本地与隔离验证

| 层级 | 命令与输入范围 | 最终结果 |
| --- | --- | --- |
| Schemas/API Client | 对应包 `test` 与 `build`；控制投影、身份绑定及旧响应负例 | 589 / 54 项通过 |
| Domain/独立原语包 | `pnpm --filter @thesis-ledger/domain test`；清理后的 `@thesis-ledger/dsa-adapter test/build` | 295 / 3 项通过；旧合同测试已删除，未恢复旧 decoder |
| Server | `pnpm --filter @thesis-ledger/server test/typecheck/build` | 2054 项通过、125 项环境门控跳过；跳过不计通过 |
| Desktop | `pnpm --filter @thesis-ledger/desktop test/build` | 81 文件542项通过，TypeScript/Vite 通过；既有大 chunk 提示保留 |
| DSA | 项目 `.venv` 的 `scripts/ci_gate.sh offline-tests` | 7703 通过、1 跳过、4 排除、626 子测试；69 警告 |
| 隔离 PostgreSQL/Worker | `C02_POSTGRES_ISOLATED=1 C04_WORKER_ISOLATED=1 pnpm --filter @thesis-ledger/server exec vitest run test/backtest/v3-postgres-isolation.integration.test.ts test/backtest/v3-worker-runtime.integration.test.ts` | 2 文件5场景通过；完整 migration、真实生产 Worker、独立 PostgreSQL/Redis 与受控 DSA HTTP；创建、投递、领取、终态、离线重放及 CAS 竞态闭合 |
| 仓库门禁 | boundaries、workspace-dependencies、migration-matrix、runtime-database-input、backtest 隔离扫描、file-size ratchet；变更文件 ESLint/复杂度/格式 | 通过；157 个回测源文件隔离扫描；尺寸门禁保留10项存量警告，未提高阈值 |

日志位于 `/tmp/canonical-*.log`；先修复定向失败再执行高层门禁。最终没有忽略失败。较早 SSE/客户端 mock 与独立旧 Adapter 的失败均已修复并重新通过对应包级验证。

## D01 结构与官方目标更新

本轮没有修改 Schema、migration、依赖、Dockerfile 或原生工程。最终 Schema diff 已复核，新增信封标记、NAV 关系、现行行情模型及显式策略合同均属于前序叶；历史 migration 不改写。使用一次性占位 `DATABASE_URL` 的 Prisma validate 通过。

matrix 与实际打包覆盖26个排序 migration SQL、60个 Prisma model、11个 raw-owned 表；head 自动派生为 `20261001120000_require_explicit_strategy_contract`。目标实际数据库 `thesis_ledger`、连接角色 `thesis_ledger_app`，同 head、71张预期表及 app role 权限核对通过：`SchemaVersion` 只读，`LedgerEvent` 允许读取/追加但禁止更新/删除，其余业务表按官方 bootstrap 校验读写权限。没有开发清库或删除卷。结构升级/备份/恢复沿用[保数据升级证据](2026-09-29-canonical-target-database-upgrade.md)，不以快更代替升级。

通过相邻 infra 官方 `./scripts/sync-code.sh all` 完成最终 Server/Worker/DSA 更新：兼容性预检通过，完整替换 dist/源码目录，退役 DSA 两个模块在容器内不存在，健康检查通过。Server 与 Worker 镜像均为 `sha256:ed7f1174ba5e6d2bfe944cc4aa7166afe2c2c435feaffaf56e9651866c9896a3`，DSA 为 `sha256:6a7252651a631bc15dfc6824468f8485cee181ad7827c87935b77ace2215d725`，本次镜像 ID 未改变。快更只修改可写层，容器重建会失去同步；本证据不声明镜像发布。

目标 Server/Worker 更新后日志没有缺表、缺模块或 `42P01`。独立原语包的后续源码清理不在 Server/Worker 递归运行依赖或镜像输入中，未改变已验证容器代码；后续 Desktop 文案变化单独重新测试/build，并验收最终构建产物。

## D02 目标与真实客户端

| 目标验证 | 结果 |
| --- | --- |
| `node scripts/e04-data-target-acceptance.mjs` | 11处源码匹配；56个 DSA 旧路径、3个 Server 旧路径拒绝；13个鉴权负例、5个旧信封拒绝；当前能力/FX/日历解析通过；净值无旧表查询 |
| `node scripts/e04-provider-target-acceptance.mjs` | 13处源码匹配、13个 Provider；82个旧信封、10个退役路径、8个 Server 旧信封拒绝；当前 OAuth、PostgreSQL/SQLite 不变性通过 |
| `node scripts/c04-target-acceptance.mjs` | 26处源码匹配；当前 Exchange 列表2条、NAV6条；7个成功冻结结果重算摘要通过，严格模式与篡改拒绝；35个旧 Run 拒绝 |
| `node scripts/canonical-consumers-target-acceptance.mjs` | 14处最终消费者/DSA源码匹配；Optimization 当前2条、旧35条排除；Risk 真实来源不可用并关闭，`FundNavPoint` 查询0次；目标结构/权限通过 |

目标43条 Run 的完整记录摘要仍为 `459bf78cc2db44b8a984f6524df11698`。上述只读检查没有创建、重试或修改旧 Run。目标正向新增 Run、真实来源冻结、领取到终态、人工重试及幂等创建复用[未改变执行输入的 N4 真实证据](2026-10-01-n4-nav-target.md)和[C01/C02 状态机证据](2026-10-02-c01-c02-completion.md)；本轮再次执行隔离真实 Worker 与目标冻结读取，未借来源准入过期重新授权。

真实客户端通过最终 Desktop 构建产物 `http://127.0.0.1:5180` 连接目标 `3000` API 验收。开发入口曾保留旧模块回显，因此最终以重新 build 后的静态预览验收，不把旧开发缓存作为最终 UI 证据。

- Market Registry/Policy/目录/能力当前请求200；中文现金分红、份额拆分、基金持仓标签与触发器一致。Tushare 只读测试 `POST /api/market-data/providers/tushare/test` 返回201、当前信封、`unconfigured`、`readOnly=true`、`attempted=false`，页面显示“实时行情：尚未配置凭据；日线行情：尚未配置凭据；筹码摘要：尚未配置凭据”，没有成功提示。没有改凭证、路由或来源准入。
- 目录同步返回当前201，Job `1ca2e1fa-6592-4ddf-a839-4164eba948cd` 经24次当前200轮询由 running 收敛到 failed；`catalog_all_providers_unavailable`、`acknowledged=false`。页面显示同步失败，后续任务轮询0次，本地仍为5920个标的；没有制造成功或替换旧本地目录。
- Exchange `4a8694de-f8b4-4d47-b0db-5ec16b29666e` 当前详情200，页面已完成、收益可读；NAV `02c4e48a-b6ee-4082-84ea-44fd54146f2c` 当前200，页面显示两笔已结算申赎、费用、部分完整度和研究假设限制。
- 旧 Run `cce3097c-5dba-40b4-b535-ef437a3c42b0` 当前详情409，最终页面明确显示“当前回测格式不受支持或冻结记录校验未通过，无法读取此任务”，没有旧结果。
- Ledger 当前专用账户仍展示数量3、30 CNY成交及已恢复状态；旧账户 `6fb65bf1-b0fc-4893-be4c-e6b964c6267a` 显示“账本记录格式不受支持”“无法读取或修订”。既有经济操作和恢复证据复用 E03，未重复写账户事件。
- 最终构建页面 Console error/warn 为空；实际 Network 只有当前业务路径，预期旧记录409与来源不可用均显式展示。

## 最终一致性 Review

完整 Spec 的单一现行合同、旧数据拒绝、CAS/有界恢复、Ledger 经济不变量、模块所有权、缓存失效、分钟线关闭、Provider/Policy/Catalog 尝试与证据身份、独立 NAV 冻结及部署输入逐项与 C01–C04/E01–E04/U01–U02/D01–D03 对账。新发现的 SDK 库存遗漏已删除并固化边界检查；关联源码反查无退役公共合同/URL或转导路径。架构、API、DSA与 infra 运维说明同步，完成文档按生命周期归档，证据链接复核。

Canonical 全部任务完成。关联多来源 Task 的 M1/M2/M3、AC01–AC20、严格历史 PIT、raw/hfq、独立备用、AI 与真实业务来源门禁继续独立，未因本次完成自动勾选。当前目录刷新来源失败、NAV 准入过期仍按现行策略显示不可用。本次没有提交、推送或发布，三仓既有 dirty 工作保留。
