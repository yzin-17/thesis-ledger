# ADR-014：ThesisLedger 工作区与 DSA Fork 的仓库边界

## 状态

已接受，取代 ADR-001 中关于仓库物理嵌套的做法；ADR-001 保留为历史决策记录。

## 背景

主系统与 DSA Fork 已经通过 HTTP API 解耦，但 DSA 仍以独立 Git 仓库嵌套在主仓库 `third_party/` 下。该目录关系容易让开发者误判源码归属，也无法由主仓库锁定 DSA 的 Git commit、镜像版本和发布来源。

产品同时从 Investment OS 更名为 ThesisLedger，需要将活动源码标识与运行时资源统一迁移，并为本地开发、Contract Test 和生产镜像建立清楚的边界。

## 决策

采用三仓同级工作区：

```text
thesis-ledger-workspace/
├── thesis-ledger/
├── daily-stock-analysis/
└── thesis-ledger-infra/
```

三个目录分别是独立 Git 仓库，父目录不建立 Git 仓库。`thesis-ledger` 只保留 DSA client、Schema、Contract Test 和 Stub；`daily-stock-analysis` 独立开发、测试和发布；`thesis-ledger-infra` 只负责以固定镜像或同级源码串联本地环境。

主系统只依赖 `DSA_BASE_URL` 和版本化 Contract V1。DSA Fork 在自己的仓库中提供 `/api/v1/thesis-ledger/...` 兼容层，不改写 DSA 原生 API。生产使用 GHCR digest 锁定镜像；本地开发默认固定镜像，源码构建通过显式 override 开启。

活动产品和基础设施标识使用 `ThesisLedger` / `thesis-ledger`，旧 Investment OS 标识不提供运行时兼容别名；历史 ADR、审计、review 和证据文件不回写。

## 依据

- HTTP 服务边界已经存在，物理嵌套没有带来运行时收益。
- 三个仓库可以分别锁定主系统、DSA Fork 和开发环境的生命周期与发布版本。
- 主仓 Stub 与 DSA 真实 Contract Test 两层可以分别保证确定性和真实集成。
- DSA 当前不支持分钟线、ATR 和完整筹码分布；Contract 必须以 capability 和结构化错误表达，而不是伪造主系统字段。

## 后果

正面后果：源码归属、Git 历史、版本关系和生产镜像来源清晰；主系统可以替换 DSA 实现；开发环境可以独立演进。

负面后果：开发者需要克隆多个仓库；`thesis-ledger-infra` 需要维护版本矩阵和 bootstrap；Contract 兼容层和黑盒测试成为额外维护面。

## 替代方案

1. 继续使用 `third_party/` 嵌套仓库：改动最小，但依赖关系隐式，无法解决目录归属和版本漂移问题。
2. 使用 Git submodule：能记录 DSA commit，但引入 submodule 初始化、权限和 CI 操作成本，且不适合作为独立发布栈的唯一编排方式。
3. 将 DSA 代码合并进主仓：会重新耦合 Python 服务与产品领域，不符合既有 HTTP 服务边界。
