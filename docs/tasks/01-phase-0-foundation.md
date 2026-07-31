# Phase 0：项目奠基与 DSA 接入

> 阶段目标：建立独立主仓、DSA Fork、基础设施、领域边界和工程规范；完成后才进入业务 MVP。

- [ ] T001：冻结 V1.0 产品范围与非目标
  - 涉及范围：整理 Spec 中 V0.1～V1.0 的功能边界、V2/V3 后移项、MVP 核心链路和“不做自动交易”的约束。
  - 完成条件：形成 `docs/spec.md`，明确每个版本包含/不包含的能力；不存在同一功能在多个版本定义冲突。
  - 验证方式：逐条对照现有 Spec 与调研文档，制作需求映射表；Review 时所有条目都有唯一版本归属。

- [ ] T002：建立总体架构 ADR
  - 涉及范围：记录 Investment OS 独立主仓、DSA Fork 作为能力服务、NestJS 负责产品领域、Python 负责 Quant/AI、PostgreSQL 为事实库等关键决策。
  - 完成条件：至少产出 ADR-001～ADR-008；每个 ADR 包含背景、决策、后果和替代方案。
  - 验证方式：由未参与设计的开发者仅阅读 ADR 后，能判断 Account/Ledger/Risk/Chip/AI 各自属于哪个服务。

- [ ] T003：初始化 Investment OS Monorepo
  - 涉及范围：创建 `apps/mobile`、`apps/desktop`、`apps/server`、`packages/domain`、`packages/schemas`、`packages/api-client`、`packages/shared`、`services/dsa-adapter`、`infra`、`docs`。
  - 完成条件：根目录脚本可统一安装、构建、测试和类型检查；各 workspace 无循环依赖。
  - 验证方式：执行 `pnpm install && pnpm -r build && pnpm -r typecheck` 全部通过。

- [ ] T004：确定 ORM 与数据库迁移规范
  - 涉及范围：在 Prisma / Drizzle / TypeORM 中选择一种，并定义 migration、seed、回滚和 destructive change 审核规则。
  - 完成条件：Server 能连接 PostgreSQL；仓库包含首个 migration 和开发 seed；生产迁移不自动执行破坏性操作。
  - 验证方式：空数据库执行 migration + seed 后可启动 Server；删除数据库后可完全重建。

- [ ] T005：建立 Redis 基础连接与命名规范
  - 涉及范围：定义 Redis 用于缓存、队列、锁、Pub/Sub 的 key 前缀、TTL 和连接配置。
  - 完成条件：Server 启动时可探测 Redis；项目文档包含 key namespace 规范。
  - 验证方式：运行健康检查能看到 Redis 状态；测试环境可独立清理本项目 key。

- [ ] T006：建立环境变量和 Secret 管理
  - 涉及范围：统一 DATABASE_URL、REDIS_URL、DSA_BASE_URL、FEISHU_WEBHOOK_URL、AI_PROVIDER、AI_API_KEY、AI_MODEL 等配置。
  - 完成条件：提供 `.env.example`；缺少必需项时启动失败并给出明确错误；Secret 不进入日志或仓库。
  - 验证方式：扫描 Git 历史和运行日志，确认未泄漏真实 Key；分别测试完整配置和缺失配置。

- [ ] T007：建立代码质量基线
  - 涉及范围：配置 TypeScript strict、lint、formatter、import boundary、测试框架、commit message 规范。
  - 完成条件：根目录存在统一质量脚本；新增违反 boundary 的导入会在 CI 中失败。
  - 验证方式：人为制造 type error、lint error、跨层非法 import，验证对应检查确实失败。

- [ ] T008：建立基础 CI
  - 涉及范围：CI 至少运行 install、lint、typecheck、unit test、build；覆盖 server、desktop、mobile 和共享包。
  - 完成条件：PR 上所有检查可见且失败会阻止合并。
  - 验证方式：提交一条故意失败分支确认 CI 拦截，再修复确认恢复通过。

- [ ] T009：Fork daily_stock_analysis 并配置 upstream
  - 涉及范围：创建自己的 DSA Fork；配置 origin 指向 Fork、upstream 指向官方仓库；记录同步策略。
  - 完成条件：本地可 fetch upstream；Fork 保留官方目录结构；有 `docs/dsa-upstream.md`。
  - 验证方式：执行一次 upstream fetch + dry-run merge/rebase，记录潜在冲突。

- [ ] T010：构建自有 DSA Docker 镜像
  - 涉及范围：为 Fork 固定构建镜像和版本标签，不长期依赖 upstream latest。
  - 完成条件：`investment-os-dsa:<version>` 可构建并启动；镜像版本与 Git commit 可追溯。
  - 验证方式：本地仅使用镜像启动 DSA，调用健康检查和一个行情接口成功。

- [ ] T011：建立 Docker Compose 开发环境
  - 涉及范围：编排 PostgreSQL、Redis、Investment OS Server、DSA；限制 DSA 只在内部网络暴露。
  - 完成条件：`docker compose up` 可拉起全部依赖；客户端只需要访问 Investment OS API。
  - 验证方式：从宿主机验证 Server 可访问、DSA 默认不可直接公网访问；Server 能通过服务名调用 DSA。

- [ ] T012：建立统一健康检查
  - 涉及范围：Server 暴露自身、数据库、Redis、DSA 的健康状态；区分 healthy/degraded/down。
  - 完成条件：健康接口返回结构稳定，并能标识单个依赖故障。
  - 验证方式：分别停止 PostgreSQL、Redis、DSA，验证状态变化符合预期。

- [ ] T013：审计 DSA 行情能力
  - 涉及范围：核对 Quote、Kline、ETF、基金、指数、财务、资金流等现有 API/模块及其输入输出。
  - 完成条件：形成 `docs/dsa-capability-market.md`，列出可直接复用、需薄封装、需补 API 的能力。
  - 验证方式：随机选 A 股、ETF、基金各一个标的实际调用并记录样例响应。

- [ ] T014：审计 DSA Portfolio / Risk 能力
  - 涉及范围：核对 Account、Trade、Cash Ledger、FIFO/AVG、Snapshot、集中度、Drawdown、StopLoss 等现有实现。
  - 完成条件：形成复用边界表，标记 V0.1 临时复用和 V0.3 前必须收回到主仓的能力。
  - 验证方式：用 DSA 建账户、录入交易并生成 Portfolio/Risk，确认文档与实际行为一致。

- [ ] T015：审计 DSA Notification 能力
  - 涉及范围：验证 Feishu、severity、cooldown、dedup、quiet hours、delivery result 等实际实现范围。
  - 完成条件：形成 `docs/dsa-capability-notification.md`；明确可复用代码和长期替换边界。
  - 验证方式：使用测试 Webhook 发送一条通知，并验证 cooldown/dedup 至少一种行为。

- [ ] T016：审计 DSA AI 与 Tool 能力
  - 涉及范围：核对模型 Provider、单股分析、Portfolio Agent、Tool Registry、Memory/Calibration 等模块。
  - 完成条件：形成 AI 复用方案，明确 AI 未来通过 Investment OS Tool 获取真实 Portfolio，而不是继续读 DSA Portfolio。
  - 验证方式：构造一个最小 Tool 调用链，确认 DSA AI 能被外部上下文驱动或明确记录需要增加的薄适配。

- [ ] T017：审计 DSA 筹码实现
  - 涉及范围：记录筹码算法输入、历史窗口、输出字段、依赖数据源和边界条件。
  - 完成条件：形成 `docs/dsa-chip-audit.md`，可据此与 InStock 做同标的 benchmark。
  - 验证方式：固定一个股票和日期保存 DSA 原始输入、输出，后续回归可重复。

- [ ] T018：完成 Phase 0 一致性 Review
  - 涉及范围：Review Spec、ADR、目录、Compose、DSA Fork、能力审计结果和版本计划之间的一致性。
  - 完成条件：不存在“DSA 是事实源”和“Investment OS 是事实源”等互斥描述；所有未决项都有 owner 与后续任务。
  - 验证方式：按架构职责矩阵逐项检查 Account/Ledger/Market/Risk/Chip/AI/Notification，并在文档勾选通过。
