# ThesisLedger 工作区与 DSA 集成迁移规格

> 状态说明：本文记录迁移前的约束与已完成的迁移验收；当前三仓边界以 [ADR-014](../../adr/2026-08-18-ADR-014-thesis-ledger-workspace-boundary.md) 为准。本文不回写历史审计证据。

## 背景与问题

当前主仓库目录内存在一个被主仓库忽略的 `third_party/daily_stock_analysis` 独立 Git 仓库。运行时虽然通过 HTTP API 解耦，但源码目录的嵌套关系会造成依赖来源、版本锁定、构建入口和开发环境边界不清晰。

同时，产品需要从 Investment OS 迁移为 ThesisLedger，并把 DSA Fork 作为独立发布的行情与量化能力服务。迁移必须保留现有未提交业务改动，不把 DSA 源码纳入主仓库，也不能让历史决策和审计记录被新品牌改写。

## 目标

1. 建立不带父级 Git 仓库的三仓工作区：`thesis-ledger`、`daily-stock-analysis`、`thesis-ledger-infra`。
2. 将主仓库的运行、包、应用、数据库、缓存和容器标识统一迁移到 ThesisLedger；旧环境标识立即停止作为配置入口。
3. 在 DSA Fork 中提供版本化的 `/api/v1/thesis-ledger/...` Contract V1 兼容 API，主系统只依赖该 HTTP 契约。
4. 保留主仓库的 Stub Contract Test，并新增真实 DSA 镜像集成栈；同一黑盒契约测试可以针对两种后端运行。
5. 为 DSA 镜像建立可追溯版本格式、上游 commit 标签、GHCR immutable digest 配置位置和兼容关系文档。
6. 提供幂等的 `thesis-ledger-infra` 启动与源码覆盖配置，不自动替换开发者已检出的分支或 detached HEAD。

## 非目标

- 本任务不创建 GitHub 仓库、不提交 Git commit、不推送远程仓库。
- 本任务不把 DSA 的原生 API 改名；新 Contract 作为 DSA 原生 API 之上的兼容层。
- 本任务不在 DSA 没有可靠数据时伪造分钟线、ATR 或完整筹码分布。
- 本任务不重写历史 review、审计证据、旧 ADR 或已发布的历史说明。
- 本任务不在主系统内引入第二个 DSA adapter 容器；兼容层直接实现于 DSA Fork。

## 迁移前状态与约束

- 编写本文时主仓库为 `/Users/yzin/code/stock`，DSA 为其下的独立 Git 仓库；迁移后实际工作区为 `/Users/yzin/code/thesis-ledger-workspace/`，三个子仓库同级且相互独立。
- 主系统通过 `DSA_BASE_URL` 调用 Quote、Bars、Indicator、Chip 能力；现有根级 Compose 同时包含主系统依赖和 DSA stub。
- 当前 DSA 原生公开能力以日线 quote/history 和筹码摘要为主；分钟线、ATR、完整分布必须以 capability 声明和结构化错误表达。
- 编写本文时主仓库存在未提交的 `README.md`、`CONTEXT.md` 和 `docs/adr/ADR-009` 至 `ADR-013`；迁移不得丢失或覆盖这些改动。
- 目标工作区父目录不纳入 Git；三个子目录分别是独立 Git 仓库。
- 首次运行时使用安全迁移流程：先备份 PostgreSQL，再恢复到 `thesis_ledger`；Redis 不复制旧缓存，迁移后重建。

## 设计

### 工作区边界

目标目录如下：

```text
/Users/yzin/code/thesis-ledger-workspace/
├── thesis-ledger/
│   └── .git/
├── daily-stock-analysis/
│   └── .git/
└── thesis-ledger-infra/
    └── .git/
```

父目录只承担本地路径约定，不保存 `.git`。`thesis-ledger` 不再包含 `third_party/daily_stock_analysis`；主仓库仅保存 API client、Schema、Stub 和契约测试。

### 品牌与标识

新代码和活动配置使用 `ThesisLedger`、`thesis-ledger`、`@thesis-ledger/*` 及以下应用 ID：

- Desktop：`io.github.yzin17.thesisledger.desktop`
- Mobile：`io.github.yzin17.thesisledger.mobile`

数据库使用 `thesis_ledger`，Compose 逻辑卷使用显式名称 `thesis-ledger-postgres-data` 和 `thesis-ledger-redis-data`。旧 `INVESTMENT_OS_*`、`investment_os` 和 `investment-os` 运行时入口不提供兼容别名；历史文档中的旧名称保留原样。

### DSA Contract V1

DSA Fork 新增以下版本化接口：

```text
GET /api/v1/thesis-ledger/capabilities
GET /api/v1/thesis-ledger/market/quote
GET /api/v1/thesis-ledger/market/bars
GET /api/v1/thesis-ledger/market/indicators/{name}
GET /api/v1/thesis-ledger/market/chip
```

接口使用独立 Bearer Token `THESIS_LEDGER_DSA_TOKEN`，不复用主系统 admin session。所有响应包含 `contractVersion: 1`、provider、marketTime/fetchedAt 或 calculatedAt 等可追溯字段。Bars 在 V1 只承诺 `1d`；不支持的 timeframe、indicator 或完整筹码分布返回稳定错误码和 capability 状态，不返回伪造数据。

Chip 响应区分摘要和可选完整分布：缺少完整分布时仍可返回摘要，主系统 UI 和风险计算不得假设 `mainPeak` 或 buckets 必定存在。

### Compose 与发布

- Docker 编排统一由 `thesis-ledger-infra` 管理，Compose 项目名固定为 `thesis-ledger-dev`；`compose.yml` 是基础配置，`compose.dev.yml` 通过 override 切换为同级源码构建。
- 主仓不再提供独立的根级 Compose；Desktop 前端在本地运行，通过 API 端口访问开发栈。
- DSA Fork 镜像使用上游版本加 Fork 修订号，例如 `v3.28.0-thesisledger.1`，并记录上游 commit。
- 生产配置使用 GHCR 镜像 digest；tag 仅用于人类识别和发布说明。
- 确定性 fixture 模式的 DSA 集成测试为阻断门槛；在线数据源 smoke test 只作为定时或手工非阻断检查。

## 外部接口

主系统通过 `DSA_BASE_URL` 访问 DSA Contract V1。请求参数沿用主系统已有 symbol、timeframe、indicator 和 chip 查询语义；服务发现、超时和重试仍由主系统 client 负责。

DSA 返回的业务数据必须映射到主系统 `packages/schemas` 的 Quote、Bars、Indicator、ChipDistribution V1。无法映射的字段不得通过猜测填充；使用 `unsupported_capability`、`invalid_request`、`unauthorized`、`upstream_unavailable` 等稳定错误码。

## 数据、状态与兼容性影响

- PostgreSQL：执行一次有备份和校验的数据库名迁移，保留表结构和业务数据；在恢复校验完成前不删除原数据。
- Redis：不迁移旧 key；以新命名空间启动并通过应用重新生成缓存。
- Docker：新卷名显式带 `thesis-ledger-` 前缀，避免与旧项目卷混淆；不自动删除旧卷。
- API：主系统客户端改为新 Contract 路径和 token；旧 DSA stub 路径仅作为主仓内部测试实现，不作为生产兼容入口。
- Git：迁移前后分别检查主仓和 DSA 的 HEAD、分支、工作树和文件清单；不重写两个已有仓库历史。

## 风险与取舍

| 风险 | 处理方式 |
| --- | --- |
| 目录移动误覆盖未提交改动 | 先记录状态，使用保留 Git 元数据的目录移动，移动后逐项核对 diff |
| 旧环境变量仍被脚本使用 | 全局搜索活动代码和配置，历史文档单独排除并在任务报告中列出 |
| DSA 能力不足以填充主系统旧字段 | 以 capability 和 optional 字段表达缺失，更新 UI/风险读取逻辑 |
| 真实镜像在线数据不稳定 | fixture mode 作为阻断集成门槛，online smoke 非阻断 |
| 镜像 tag 漂移 | thesis-ledger-infra 默认 tag 加 digest 配置，生产示例强制 digest |
| DSA release workflow 拒绝 Fork 版本号 | 将发布校验扩展到 `-thesisledger.N`，并增加 workflow 校验测试 |

## 未决事项

- GitHub 上两个新公共仓库的实际创建和权限配置需要用户单独授权后执行。
- GHCR 最终组织/包可见性、签名工具和 digest 的具体值在首次发布后补入部署配置。
- 正式生产环境的 PostgreSQL 备份存储位置和保留周期不由本次源码迁移决定。

## 验收标准

1. 目标工作区存在三个同级独立 Git 仓库，父目录没有 `.git`，主仓库没有 `third_party/daily_stock_analysis`。
2. 活动源码、配置、构建脚本和运行时标识完成 ThesisLedger 全量迁移；历史文档和历史 ADR 未被批量改写。
3. 主仓 Stub 栈的黑盒 Contract Test 通过；DSA Fork 的 Contract V1 测试、fixture 集成测试和 Docker 构建通过。
4. thesis-ledger-infra 的默认固定镜像配置、源码 override、启动脚本和契约测试入口可执行且幂等。
5. 主系统、DSA 和 thesis-ledger-infra 的文档记录兼容关系、版本策略、数据迁移与回滚步骤。
6. 运行 lint、typecheck、unit test、build 以及可执行的 Compose 配置检查；所有未完成项和外部依赖在任务文档中明确记录。
