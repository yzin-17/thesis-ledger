# 当前 Market、Backtest 与 Ledger 运行链

本页记录现行模块与消费边界。替换要求以[Spec](../specs/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)为准，运行验收以[Task](../tasks/2026-09-29-thesis-ledger-canonical-runtime-replacement.md)及其证据为准。

## 接口与合同所有权

| 领域     | 当前入口                                                     | 合同与执行所有权                                                                                                            |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Market   | `/api/market/*`、`/api/market-data/*`                        | Market Reader 核验来源、时间、路由、准入和当前证据；Schemas 拥有公开响应与客户端投影                                        |
| Backtest | `/api/v1/backtests/runs`、`/api/v1/backtests/runs/nav`       | PostgreSQL 当前 Run 状态、attempt CAS 与有界恢复；Exchange/NAV 独立输入与执行；冻结读取守卫绑定配置、快照、模型、结果和 Run |
| Ledger   | `/api/v1/ledger/*`                                           | Ledger 命令、Repository 和投影只支持持久信封版本 3；账户经济事实与 Backtest SimulationLedger 分开                           |
| DSA      | `/api/v3/thesis-ledger/*`、`/api/v3/thesis-ledger/control/*` | 专属 Data/Control 当前合同；Provider 适配、SQLite 控制状态与原文证据留在 DSA                                                |

API Client 在传输边界解析响应并绑定请求 Run/Provider/Job 身份。Desktop 使用 TanStack Query 管理当前状态；Policy Desired 与 Effective、目录状态与同步任务分别显示，失败不变成成功或空集合。旧路径、旧 Run、旧 Snapshot 和旧 Ledger 行拒绝读取，不自动升级或重算。

## 业务消费

Portfolio、Performance 和 Automation 经 Market Reader/领域服务获取行情；分钟线来源未就绪时返回不可用。Risk 场外基金上下文经 `MarketService.getFundNavHistory` 获取当前净值，核验标的及评估时间，不直读 `FundNavPoint`。窗口不能覆盖开仓日期时不补持有期数。

Strategy Optimization 分组查询属于优化领域，读取结果交由 Backtest 完整冻结守卫校验；旧模式及损坏记录不生成当前指标。Research/AI 的回测入口经当前准备、Run 和结果服务。账户、Journal、Import、导出与备份的账本投影经当前 Ledger 读取器；历史注释或归档文件不能成为当前经济事实。

内部 Run 事件由当前状态机提交后发布，Desktop 仍解析当前摘要；初始资金只取当前 RunConfig 的本币金额。事件发布不建立另一条执行入口。

## 保留的格式标识

策略 AST `schemaVersion=2`、Ledger 经济 `payloadVersion=1`、HiThink 原生单位格式 v1/v2、映射证据 `contractVersion=1`、来源适配器修订和 `raw-times-factor-over-fixed-anchor-binary64-v2` 各自标识不同层的现行格式。它们用于原文、模型或摘要校验，不能解释为 ThesisLedger 旧 API。历史 migration 与验收文档保留原文。当前 Exchange 执行与 Ledger Repository 的存量文件名，以及 `toLedgerEventV2` 持久行转换器，均只有现行实现；转换器先要求当前信封标记再解析，不接受旧行。公共类型已按领域命名。

DSA 日历与可交易性事实分别由 `thesis_ledger_dependency_facts`、`thesis_ledger_tradability_provider` 拥有，旧模块路径和转导别名已删除。DSA 原生 `/api/v1` 继续服务其自身业务。

## 部署与验收

结构由全部排序 migration SQL 与 raw-owned 清单共同定义，运行时 head 自动派生。普通启动与更新只检查结构；显式开发重建和正式保数据升级遵守独立的精确目标、备份及恢复门禁。

代码变化通过相邻 infra 官方 `sync-code.sh` 同步已有容器，依赖、结构或镜像变化使用 `update.sh`。快更替换完整目录以删除退役代码，但只写容器可写层；重建后必须重新同步或构建含当前源码的镜像。详见[三仓矩阵](version-matrix.md)与 infra Docker 更新说明。

Canonical 完成表示单一现行链和其范围内验收闭合。严格历史 PIT、raw/hfq、独立备用、AI 和完整业务来源门禁继续由关联多来源 Task 独立验收。
