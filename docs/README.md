# ThesisLedger 文档导航

这里是主仓文档的唯一入口。DSA Fork 和 `thesis-ledger-infra` 保持各自仓库的文档边界，不在本目录重复维护 Provider 实现或 Compose 说明。

文档治理规则见 [`项目文档生命周期指南`](DOCUMENTATION-GUIDE.md)，治理记录见 [`reviews/`](reviews/)。

## 当前文档

| 目录 | 用途与主要入口 |
| --- | --- |
| [`specs/`](specs/) | 当前产品、领域和功能规格。主要入口：[ThesisLedger V1 产品范围](specs/2026-08-18-thesis-ledger-product-v1.md)、[统一回测系统 V2](specs/2026-08-28-unified-backtest-v2.md)、[投资组合快照系统](specs/2026-08-28-portfolio-snapshot-system.md)、[市场数据与标的中心 v1.2](specs/2026-08-18-market-data-provider-spec-v1.2.md)、[交易与成交记录系统](specs/2026-08-26-trade-execution-ledger-system.md)、[投资复盘工作台（统一 Trade Projection）](specs/2026-08-28-journal-review-trade-projection.md)、[现金页面 UI 优化](specs/2026-09-03-cash-page-ui-optimization.md) |
| [`tasks/`](tasks/) | 当前实施任务和仍需运行时验收的任务；入口见 [`tasks/README.md`](tasks/README.md)，完成态历史见 [`archive/tasks/`](archive/tasks/) |
| [`architecture/`](architecture/) | 当前跨仓边界、实现结构和兼容性。主要入口：[DSA 能力与主仓边界审计](architecture/2026-08-18-dsa-capability-audit.md)、[市场数据 v1.2 实施说明](architecture/2026-08-18-market-data-provider-v1-2-implementation.md)、[版本与兼容矩阵](architecture/version-matrix.md) |
| [`domain/`](domain/) | Ledger、Trade、收益、风险、策略、回测、Journal、Provider 和自动化等稳定领域说明 |
| [`engineering/`](engineering/) | 数据库、Redis、Secret、迁移、UI 组件、DSA 集成和第三方依赖工程规范 |
| [`operations/`](operations/) | 日常运维、发布、备份恢复和迁移/切换手册；Trade Projection 切换见 [`影子迁移与分阶段切换手册`](operations/2026-08-28-trade-projection-cutover.md) |
| [`guides/`](guides/) | 面向用户的当前使用说明 |
| [`adr/`](adr/) | 已接受的架构决策记录；新决策使用递增编号，不覆盖历史 ADR |
| [`reviews/`](reviews/) | 当前仍承担发布门禁、运行阻塞或跨仓审计作用的 Review 与证据 |
| [`benchmarks/`](benchmarks/) | 固定基准集和性能证据 |

## 当前主链路

- 真实账户事实：`LedgerEventV2 → Position / Trade / Cash Projection → Portfolio / Journal`。
- 投资复盘：Journal 消费统一 Trade Projection，区分 `TRADE_CYCLE` 与 `CLOSE_SLICE`。
- 回测：V2 设计使用独立模拟事实域 `DataSnapshot → Simulation Event Engine → SimulationLedger → BacktestResult`，不得写入真实 Ledger。
- 市场数据：ThesisLedger 负责 Desired Policy、目录和产品侧缓存；DSA Fork 负责 Provider runtime、Effective Policy 与行情能力。

## 历史文档

[`archive/`](archive/) 保存已完成、被取代或仅用于历史审计的 Spec、Task、Review、Architecture 和 Domain 文档。归档文档保留上下文和验证证据，但不作为当前实现依据；入口见 [`archive/README.md`](archive/README.md)。

新功能按指南成对创建 `specs/YYYY-MM-DD-<topic>.md` 与 `tasks/YYYY-MM-DD-<topic>.md`。被新方案明确取代后应及时归档，不继续作为根导航的当前入口。
