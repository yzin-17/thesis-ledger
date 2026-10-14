# 任务状态对账 Review

> 归档说明（2026-10-14）：本页是原日期/输入下的一次性运行、来源或治理证据，历史失败与适用边界保留。当前范围和未通过验收由[当前任务索引](../../tasks/README.md)及各正式 Task 维护；本次归档不表示重新验收或整个产品已完成。

本轮只完成[文档治理任务](../tasks/2026-10-03-task-state-reconciliation.md)。功能实施和验收状态继续由各原 Task 拥有；本文只记录状态修正依据与承接关系，不是一份新的功能进度表。基线为主仓 `514abeeb`、DSA `d4054960`、infra `dd3d92b5`，三仓初始工作树干净。

## 实际执行的只读检查

2026-10-03 22:20（北京时间）核对本机目标：

| 检查 | 实际结果 | 支持的结论与边界 |
| --- | --- | --- |
| `docker ps --format '{{.Names}} {{.Status}}'` | Server、Worker、DSA、PostgreSQL、Redis 与 traffic-monitor 共六个容器 healthy | 部署就绪事实；没有执行更新或故障注入 |
| `GET /api/v1/health` | 200/healthy，`schemaVersion=20261001120000_require_explicit_strategy_contract` | 当前结构标记；本轮未检查每张表或数据库权限 |
| `GET /api/v1/fund-investment-plans` | 200，空列表 | 解除旧 404，不证明创建、Scheduler、成交或幂等 |
| `GET /api/v1/performance/series?mode=actual` | 200，`availableIntervals=[1d,1w,1mo]`、`points=[]` | 解除旧 404，不证明真实点位或 Tooltip/触屏 |
| `GET /api/v1/journal/review-snapshots` | 404 | 与 `journal.controller.ts` 只有 Snapshot POST、无列表/详情 GET 一致，原 Spec AC13 尚未交付 |
| 当前公共 Schema 与可见入口源码 | Bar/RouteTarget `timeframe` 为 1m/1d；账户数据导入草稿、对账入口显示暂未开放 | 不能把收益走势 interval 当行情周期交付，不能把历史截图导入实现当作现行入口开放 |

没有请求行情、模型或其他真实 Provider，没有创建账户、计划、Run 或 Snapshot，没有写数据库、更新容器或重新执行应用测试。

## 原断言与后继证据

先核对旧 RouteTarget、消费者、BullMQ Spec 的完整验收标准，再与[Canonical 收口](../../tasks/evidence/2026-10-02-canonical-final-completion.md)、[C01/C02](../../tasks/evidence/2026-10-02-c01-c02-completion.md)、[共同价格验收](../../tasks/evidence/2026-10-03-common-price-baseline.md)及[后继 Task](../tasks/2026-10-03-multi-source-remaining-acceptance.md)对照。下表只说明哪些断言能复用证据，未覆盖部分仍由原 Task 或明确 successor 持有；三个旧 Task 均未整体归档或补勾。

| 原 Spec 断言 | 现行承接与证据 | 未覆盖或范围替代的处理 |
| --- | --- | --- |
| RouteTarget AC1–AC5：字段/目标限制、source pinning、顺序备用、目标健康及 provenance | Canonical E02/E04 的当前 Data/Control 合同；共同价格精确主备、`routeIndex=1`、冻结重放 | 当前原生接口版本已改变；旧 G1 的冷主源 ≤5s、成功备用 ≤10s 没有相同条件的新测量，仍由[原 Task](../../tasks/2026-09-16-market-data-route-target-v2.md)持有 |
| RouteTarget AC6、AC7：固定 ETF 默认主备、V2 handshake/apply/effective | 多源 Spec §1.1 与 Canonical 替代了固定默认和旧公共路径；当前按三口径显式配置 | 不再要求恢复 `tencent→akshare` 默认或旧握手。AKShare 来源已被用户跳过，属于范围替代，不是旧 AC 成功 |
| RouteTarget AC8：本地检查、公开 endpoint、Docker 与 deadline | 后继本地回归、P01 当前不可变镜像和 P02 协议/冻结读取 | endpoint/镜像层已有证据；延迟场景保留，健康与 Run 完成时间不替代请求耗时 |
| 消费者 AC1–AC5：acceptance、冻结、单向边界与禁止旁路 | Canonical E01/U02、消费者目标拒绝/读取脚本与边界门禁；共同价格固定快照及重放 | 新 Run 的严格历史语义明确由多源 S05 与后继 AC04 持有；`strictPit=false` 不取得原历史时点资格 |
| 消费者 AC6：Risk/Performance/Backtest/Portfolio/Automation 集成 | 当前消费者脚本、真实 Run 与冻结读取覆盖其声明场景 | Risk 来源不可用时的拒绝证据不是正向扫描；各消费者的其他产品/估值/调度断言继续在[原 Task](../../tasks/2026-09-16-market-data-consumer-consistency-v2.md)和所属功能 Task 核对，不整体关闭 G1 |
| 消费者 AC7、AC8：精确确认的开发清理、备份/恢复、重建后对象为空 | 原 T4/T5 的受保护入口、dump 校验与恢复计数是当时完成证据；后继 P02/P04 增加同批状态保真恢复 | “重建后为空”是重建检查时点，不要求运行 smoke 后重复清零；当前如另有清理需求，仍须新目标确认。后继恢复不授权真实清理 |
| BullMQ AC1–AC3、AC10–AC11：durable owner、最多三次、CAS、取消/补投与分页恢复 | Canonical C02 定向状态机、真实隔离 PostgreSQL/Redis/生产 Worker 与目标幂等/旧记录拒绝 | 代码正确性证据可以复用；claimed 后硬杀/运输记录重建与 Redis 短停的完整目标故障场景没有后继证据 |
| BullMQ AC4、AC5：旧非终态迁移与兼容 jobs API | 原迁移只保留历史事实；Canonical C02/C04/U01 明确拒绝旧 Run，删除 jobs 可达入口 | 当前合同以 Canonical 为准，不恢复旧 API 或改写历史行，不标成旧兼容断言通过 |
| BullMQ AC6–AC9：SSE/429、Electron 代理、独立 Worker 健康与目标验收 | 当前 Worker/镜像 healthy、浏览器读取和隔离 Worker 闭环覆盖有限场景 | [原 T4](../tasks/2026-09-09-backtest-bullmq-lifecycle.md)继续持有当前 Run 的硬杀、Redis、唯一终态、429、Electron SSE/取消/结果路径；同批恢复不是故障注入 |

[旧 ETF 适配器内部备用任务](../tasks/2026-09-08-etf-daily-independent-fallback.md)已明确被显式 RouteTarget 取代。其 AC1/AC3 的内部跨源回退及旧 Provider/fallback 字段不再是当前契约，成功/失败与来源披露的产品意图由共同价格显式整窗主备承接。历史缓存/路由 Task 中“四类重复请求缓存、显式刷新/陈旧标记、注册表/面板”等断言仍可复用原证据，V1 合同及内部通道不能继续作为当前设计入口。

## AI 验证输入与范围

本轮读取已有日志，不重跑测试。最近主仓历史包含 #44 与 #45 合入，以及当前 Canonical/多源总提交；只以本地历史确认合入，不查询或推断远端当前 CI。

| 已有日志或记录 | 实际可复用范围 | 不能由此关闭的门禁 |
| --- | --- | --- |
| `/private/tmp/ledger-test-split-server-full-20261003.log`，及共同价格的最终 Server 日志 | 输出解析 8、JSON Mode 27、SDK HTTP/SSE 20、就绪 16、verified-save 22、onboarding HTTP 4 项均通过；总计 2074 passed/125 skipped | 受控 HTTP/SSE 不是在线模型；数据库跳过不是通过；当前完整 CI 和全部超时/费用断言仍待匹配 |
| `/private/tmp/common-price-desktop-full-20261003.log` 与 Schema 全包日志 | Provider UI 30、auto-save 7、凭据 5 项；Desktop 总计 543、Schemas 589 项通过 | 组件/SSR 用例不证明浏览器保存、Electron 或真实费用 |
| [共同价格回归记录](../../tasks/evidence/2026-10-03-common-price-baseline.md)与[Canonical 收口](../../tasks/evidence/2026-10-02-canonical-final-completion.md) | Schema/Server/Desktop 构建、边界/依赖、尺寸 ratchet 及受影响文件 lint | 不声明完整当前 `pnpm lint` 通过；旧错误数与旧缺依赖只保留历史时点，不能作为当前固定阻塞 |
| [AI SDK Task](../../tasks/2026-09-19-vercel-ai-sdk-integration.md) T2/G0/G0.1、[用途配置 Task](../../tasks/2026-09-21-ai-provider-model-usage-configuration.md) G2/G4 与 9/23 lmstudio | 原隔离状态/预算事务、目标受控测试及无认证零价三用途生成已有独立证据 | Provider 保存 CAS、默认引用竞争、认证/非零计费、新版 AC-09 的各执行面和 Electron 不自动通过；原免费模型限流也不等于现在所有来源不可用 |

最新包级日志中 `ai-execution-state-postgres` 9 项、research recovery 4 项、research SDK 1 项、research query 3 项、strategy SDK PostgreSQL 3 项均跳过。原单独执行记录证明其当时的断言，不能把新跳过批次写为通过，也不能否认历史数据库门禁确实曾执行。

## 取消、归档与状态来源

RQData 用户取消决定已在原 Spec/Task 顶部明确，注册页面已经关闭。原 RQ02–RQ05 未执行，归档时改成取消记录，不改成通过；取消 Spec/Task 保留历史入口预检和权限未知。AKShare/EastMoney、Tushare ETF 来源、TdxAiData 已有跳过决定，不列为必须恢复动作。其他 Provider 的凭证/授权义务仍由[凭据任务](../../tasks/2026-09-14-market-provider-credentials.md)持有；不把 ETF 接入跳过扩大成所有来源配置任务取消。

现金页面 UI AC1–AC9、实时行情涨跌展示 AC1–AC4、巨型组件拆分 AC1–AC7、风险中心交互 AC1–AC22、建仓时间补录 AC1–AC6 的原 Spec 与 Task 完成记录已核对：声明范围已完成、无未转交的实施或验收义务，归档这五个 Task，现行产品 Spec 保留。风险中心 AC6 明确仅声明本地验证，其他纯重构/展示/补录 Task 的测试策略与最后 Review 也没有独立的真实 Provider/设备放行要求；不能把未执行声明变成新增强制门禁。现金 UI 的多币种/大量流水证据仍是 fixture，其余更高层未执行声明仍保留，不扩大验收层级。

组合收益指标虽然原 Task T1–T3 均已完成，但完整 Spec 顶部明确“待运行时验收”，因此仍保留 active 并在原 Task 明确 G1，不以 AC 本地测试为由归档或取消该义务。现金资金划转、定期入账、估值快照与服务端目录等仍涉及实际资金/调度/名称消费断言，未覆盖的产品验收继续在原 Task 核对。

其余主题保留原未勾选项及历史证据，在权威 Task 首段区分未实现、部分实现、待验收与来源前置；存在未覆盖断言的文档不为清理目录而归档。导航按执行性质链接原 Task。TODO 删除过期文字引用，不新增多源或当前验收条目。最终文档检查结果见[治理 Task](../tasks/2026-10-03-task-state-reconciliation.md)；后续建议顺序只作选择入口，不自动执行。

全目录扫描另发现旧归档移动留下的相对路径及锚点，已修正回真实文档；未保留的 `provider-automation-stale.jpeg`、已不可取回的 `/private/tmp/m3-r05-abstract-contract-0928/contract-summary.json` 与退役 DSA `thesis_ledger_v2_dependencies.py` 的两处源码定位保留为文字历史位置，不作为当前可取回证据。没有补造截图、原文、源码或验收结果。
