# 基础行情缓存盘点与受控验收设计

核对时间：2026-11-11 17:28，北京时间。对应[规格草案](../specs/2026-11-11-market-base-result-cache.md)及[当前任务](../archive/tasks/2026-11-11-market-base-result-cache.md)。本记录证明源码盘点和验收设计，不证明缓存已实施或运行态已更新。

本页保留准备阶段事实；后续用户60秒选择、源码实现、门禁失败及旧DSA消费者恢复见[11月12日实施证据](2026-11-12-market-base-result-cache.md)，当前状态只由Task维护。

## 现场与执行边界

主仓 `main`、DSA `yzin`、infra `main`，开始时分别有559、203、280条 `git status --short` 记录。保持原工作区和全部未提交改动，不建立 Goal、分支或工作树。当前只新增本主题三份中文文档并补充原任务与索引链接；未改缓存、凭证、路由、来源参数、业务数据或 Docker。

17:28首次核对时，通过 Codex 自动化工具查看既有 `k`，并读取本地自动化定义：状态 ACTIVE，当时关联原对话；晚间仍按23:05、23:15、23:35、次日00:05执行。共享回执目录已有 `asia-afternoon`、`selected-retry`、`tencent-daily-response`、`tencent-window-fix`，没有 `us` 目录。此时尚未到美股采样时段，没有手动启动或新建计划。

17:38收到原对话按用户最新要求完成迁移的回执，再次通过 Codex 自动化工具查看 `k`，并核对本地定义：`target_thread_id` 已为本接续对话 `01a1c9ec-18d0-7e52-a24f-96225c5130d1`，状态 ACTIVE，名称及调度规则保持。原对话回执说明仅修改目标对话及更新时间，原提示词、创建时间、执行许可、四批时间和预算均保留，且同名自动化只有此一项。本对话只核验并同步任务归属，没有再次修改自动化、新建副本或手动启动。后续由本对话统一接续回执，结束后停止现有计划。

中港结论继续引用[既有记录](2026-11-11-cn-hk-intraday-observation.md)：同根柱可盘中变化、Yahoo时点差、富途小时柱未变但无原始确认标记、跨容器代次分开比较；收盘后复试与盘中证据分开。没有重跑已接受的推荐、节流与 T9/T10 浏览器检查。

## 当前源码调用链

| 读取或缓存 | 已核对的入口 | 当前事实与接入影响 |
| --- | --- | --- |
| 周期基础行情 | `apps/server/src/market/market-period-reader.ts:84` | 先以日线及最多3650条调用 `MarketBarReader.readChartV3`，再组装周期视图；获取后重读日历，窗口变化最多一次有界重取。 |
| 统一 K 线入口 | `apps/server/src/market/market-bar-reader.ts` | 交互走 `MarketChartReaderV3`；研究/冻结有独立路径，不能将新增交互缓存装到所有读取的公共外壳上。 |
| 精确图表取数 | `apps/server/src/market/market-chart-reader-v3.ts:164` | 已取得有效路由、目录和具体目标后，选择器的 `read` 回调调用 `dsa.marketChartBarsV3`；这是优先考虑的基础结果缓存位置。 |
| 来源与响应关联 | `apps/server/src/market/market-chart-selector-v3.ts:31` | 请求带具体目标及路由位置；每次结果经请求/响应关联 Schema 与有效政策修订检查，缓存不能绕过或将旧请求 ID 原样回传。 |
| 周期派生视图 | `apps/server/src/market/market-period-view-cache.ts:134` | 成功派生结果内存及 Redis TTL 均为60秒；键含来源/价格基础指纹、日历及 `evaluationAsOf`。只减少可复用派生计算，不避免此前基础取数；实际命中还受显式时刻限制。 |
| 周期指标 | `apps/server/src/market/market-period-indicator-reader.ts:90` | 按输入指纹、引擎版本和参数缓存；写入期限为当前时刻加60秒，同样发生在基础取数之后。 |
| 现有控制围栏 | `apps/server/src/market/market-cache-control.ts`、`packages/schemas/src/market-cache-context-v3.ts` | 可读取控制上下文并复核代次；目前只接受五类 `data` 能力，不接受 K 线的 `bar` 身份或具体目标参数。 |
| DSA 控制投影 | `../daily-stock-analysis/src/services/thesis_ledger_cache_context_v3.py` | 代次取自路由控制 epoch、相关来源配置/启停/凭证及适配修订；使用前后采样防止不稳定快照，但当前能力范围同样不含 K 线。新契约需纳入精确目标的资格事实。 |
| 通用结果缓存 | `apps/server/src/market/market-result-cache.ts` | `MarketResultCache` 有 fresh/last-valid 两层，失败时可能返回旧成功值；不能原样用于本草案“首个闭环不增加旧值回退”的语义。 |
| 并发协调 | `apps/server/src/market/market.service.ts:56` | 现有私有 single-flight 与 Redis 锁供相关读取使用；不是图表可直接注入的公共能力。复用时应按 Market 职责提取，不能反向依赖或复制一套 Provider 级机制。 |

`MarketChartReaderV3.read` 当前未消费 `input.refresh`；`MarketPeriodReader` 把该参数传入，但派生缓存之外的完整刷新语义尚未贯通。DSA 当前 `/market/chart-bars` 请求没有对应的刷新参数。后续必须定义 Server 层绕过边界并核对下层行为，不能把现有“刷新”当作已证明的端到端上游重取。

图表窗口由 `market-chart-window.ts` 规范化为市场日期范围，`limit`影响默认范围及最终切片；新增基础键应以同一窗口计划为准。不能把每次新的随机请求 ID 或当前毫秒时刻加入键使其永不命中，也不能删除派生视图已有的显式时刻约束。

## 既有缓存的保留范围

`market-result-cache.ts` 当前定义普通报价15秒 fresh／1天 last-valid，ETF报价由 `market-quote-cache-policy.ts` 覆盖为600秒 fresh；筹码15分钟 fresh／7天 last-valid。净值历史的既有策略按结束日期返回30天或6小时 fresh，last-valid为90天。这些是现状记录，不是对其市场日历语义或本草案 TTL 的认可；本轮不改变。

DSA 精确分钟执行在 `thesis_ledger_minute_execution.py` 使用 `cache=False` 创建适配器；精确日线执行在 `thesis_ledger_exact_bar_execution.py` 根据来源的 `cache_verified_daily_factory` 决定工厂实例缓存。工厂对象复用不等于行情结果缓存。BaoStock有独立的状态/上市资料 acquisition cache，DSA Base 还有其他领域缓存；本次只核对相关入口，未宣称已经穷尽各 SDK 内部缓存或所有低频领域。

因此新增缓存前还有明确义务：对 C1 选定口径追到实际适配器，记录结果缓存、获取时间、刷新和剩余时效预算。其余来源与低频数据不能从代表样本推导统一 TTL，也不把60秒加下层 TTL后的结果仍称作60秒新鲜度。

## 受控验收矩阵

以下是待执行设计，全部未用真实 Provider 请求验证。复用现有图表 fixture、Vitest 可控时钟、受控 DSA HTTP/方法计数及独立 Redis harness；计数分别记录控制请求和价格请求，不能只减少控制接口就声称减少上游取数。

| 编号 | 输入与触发 | 必须观察到的结果 | 责任 |
| --- | --- | --- | --- |
| A1 | 同代次同来源同窗口顺序两次；推进到原始到期边界，再读 | 首次价格调用1次，第二次不增加；边界后新增1次。命中不延长期限；返回原始来源时点与值。 | C3、C4 |
| A2 | 相同键20个普通并发请求；两个 Server 实例共享独立 Redis | 进程内与可用 Redis 协调下按约定合并；每个请求有关联正确的结果。失败/取消后协调状态释放，无永久挂起。 | C3、C4 |
| A3 | 逐一改变市场、资产、标的、周期、复权、start/end、limit、用途、来源及路由位置 | 任何不同语义不能错误共用；不同请求 ID 对同一语义可以命中。主源失败后备用只消费备用键。 | C2.1、C3、C5 |
| A4 | 已有成功值后变更启停、权限/依赖资格、凭证、路由或适配修订；读取期间再变更一次 | 命中前控制拒绝或新代次导致未命中；前后代次不同不发布、不返回旧结果；原始凭证不出现在键和日志。 | C2.2、C3 |
| A5 | 未过期时刷新；两个同时刷新；刷新前普通读取晚到 | 刷新绕过新增基础与原派生缓存，同轮刷新可合并；旧普通读取不满足刷新，不能覆盖刷新结果。下层是否重取独立计数。 | C3、C6.2 |
| A6 | 无效 Schema、空数据、未覆盖、权限/额度/限频、网络超时；随后重试普通读 | 无正常成功缓存条目；不隐式返回旧成功值。分类与原切源规则保持，不因限频自动立即重试。 | C3、C4 |
| A7 | Redis读取、写入、加锁、释放分别失败或不可用；控制读取同时失败 | 缓存故障走原受控数据读取，已有有效结果可返回；控制故障不能借缓存降级放行；锁等待受原总时限约束，取消不污染其他等待者。 | C3、C4 |
| A8 | 缓存信封/指纹/目标/政策修订损坏，旧请求 ID 与新请求混用 | 损坏值视为未命中或拒绝，不能伪造关联；命中重建的仅为请求关联，价格、时点、来源与历史冻结事实保持。 | C2.1、C3 |
| A9 | 正常交易、盘前后、午休、周末节假日、半日市、夏令时、日历未知；复权版本或更正变化 | 完整收盘条件由共享日历提供；未知不进入长缓存，历史与当日不混用；原始完成标志与 adapterComplete区别保留。 | C1、C5 |
| A10 | 下层返回接近到期的已缓存结果，随后 Server 再次命中或转存 | 不从转存时间重置有效期，原获取时点保留；证明合计时效没有突破最终策略。 | C1、C3、C5 |
| A11 | 正式目标页面同范围刷新，代表四宽与失败恢复 | 保留图形和单个加载圈直至最后相关请求结束；原来源、时点、错误及导航正确，无越界或裁切。 | C6.2 |

可复用入口包括 `apps/server/test/market/market-chart-reader-v3.test.ts`、`market-chart-selector-v3.test.ts`、`market-period-reader.test.ts`、`market-period-view-cache.test.ts`、`market-cache-control.test.ts`、`market-cache-redis.integration.test.ts` 及 `packages/schemas/test/market-cache-context-v3.test.ts`。DSA复用 `tests/test_thesis_ledger_cache_context_v3.py`、`test_thesis_ledger_chart_v3.py`。它们提供测试接缝，不等于已覆盖新增契约；不预先运行尚未修改代码的全量检查。

## 腾讯门禁与真实读取边界

已核对保存的 `ci.log`：16:20:43结束的完整门禁为7902通过、10失败，范围与[DSA证据](../../../daily-stock-analysis/docs/evidence/2026-11-11-tencent-daily-response-window.md#完整门禁与失败归因)一致。核对时十项相关测试文件、Dockerfile及所查能力目录/注册文件修改时间均早于该日志；最新腾讯原生模块为16:53:15，晚于日志。因此不能把旧完整结果认证为最新源码通过。

本轮后续复核发现并行工作仍在修改 DSA 的 `data_provider/thesis_ledger_sources/futu.py`、`src/services/thesis_ledger_reference_identity.py`、对应测试，以及主仓窗口选择与回测读取错误路径。这些不属于本轮写集，也不能仅凭上述文件时间判断全部失败输入保持不变。源码稳定后应按原 L3 核对受影响断言，再运行必要检查；本次没有在移动中的并行基线上重跑全量门禁或认证其结果。

未删除或放宽断言、未部署，未继续腾讯请求。最终读取预算已耗尽；腾讯完整门禁、正式更新和另行明确预算后的精确读取继续留在原任务 L3。本轮没有扩大到研究资格、来源目录或构建缓存的代码修复。

## 关键输入指纹

以下 SHA256用于界定本次源码盘点，非运行容器或镜像证明。路径相对三仓工作区根目录。

| 文件 | SHA256 |
| --- | --- |
| `thesis-ledger/apps/server/src/market/market-chart-reader-v3.ts` | `3dd3985b094e9145106ed6ab1be78ce23708b658b60e04494ed261ca827cbfe4` |
| `thesis-ledger/apps/server/src/market/market-period-reader.ts` | `76cf3520312818b41ef9495b79e497b63ddb0be75ed7afd8aacb5af9c861663d` |
| `thesis-ledger/apps/server/src/market/market-period-view-cache.ts` | `3608bdb91df62a3d8a9505018a9ae58b610c2c759139413c8e157bd1f36a67be` |
| `thesis-ledger/packages/schemas/src/market-cache-context-v3.ts` | `6f9e40b0ed097721546a3f20c5e6e174c7e5d9926f50d3903dfc3c3cf3b5cfa8` |
| `daily-stock-analysis/src/services/thesis_ledger_cache_context_v3.py` | `4a875c06849cecc74c8001879b33b4952ea2f01d253bc011faf5cc7dfc1b7c9e` |
| `daily-stock-analysis/data_provider/tencent_native_daily.py` | `fab2735f110ecd6c002bdbab03b87c7c0ab5f5dab333f50b7b80624199fe7e9f` |
| `daily-stock-analysis/docker/Dockerfile` | `4ffd2d2b18d880cbd8773e0d8d3a192b342b1d64d8e412db298ae1de5964be49` |

## 本轮验证与审查边界

只执行只读源码/任务/本地回执分析及自动化查看；实际写集为本主题三份文档、原采样 Task 接续段和 specs/tasks 索引，共六份文档。相对链接及锚点检查通过，六份文档的定向 `git diff --check` 退出0，三份新文档无尾随空白；AC1～AC6均有任务映射，仅C0交付项勾选。表中七个源码指纹复核无变化；另有并行工作区变更，未覆盖或归入本轮成果。

文档语言、任务依赖、未决事项与实施范围经规划核对，C0交付通过；缓存实施因T8真实输入、TTL与控制契约未就绪而阻塞。未将规划审查当作功能验收，不归档或转移未完成义务。未运行功能测试、Redis集成、Docker或真实来源；现有 Redis 测试 harness会创建/清理隔离容器，文档工作不触发它。
