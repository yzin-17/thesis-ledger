# Web 与手机端功能差异盘点

> 核对日期：2026-10-22。对象为 `apps/desktop` 的 Web 界面与 `apps/mobile` 的 Android / iOS 应用。依据为 `HEAD da002744` 加当前未提交工作树；工作树包含大量既有修改，不能把 HEAD 单独当成本次源码快照。
> 以下保留实施前的源码盘点基线，不代表后续安装包、模拟器或真机验收。2026-10-23 第 0、1 批已接入五入口及账户至账本链路，并修复实际上传暴露的原生文件与服务端响应兼容问题；编译和受控运行增量见[实施记录](../tasks/evidence/web-mobile-parity/2026-10-22-batch-0-1.md)，当前状态只由配套 Task 维护。

配套：[目标规格](../specs/2026-10-22-web-mobile-feature-parity.md) · [迁移任务](../tasks/2026-10-22-web-mobile-feature-parity.md)。功能迁移进度只由配套 Task 维护。

2026-10-24 第 2 批增量的源码、独立原生编译/运行与隔离 CI 收口见[当前验收记录](../tasks/evidence/web-mobile-parity/2026-10-24-batch-2-ci-closeout.md)。以下差异矩阵继续作为实施前基线，不用于覆盖配套 Task 的当前勾选状态。

2026-10-25 第 3、4 批增量分别见[复盘研究验收](../tasks/evidence/web-mobile-parity/2026-10-24-batch-3.md)与[策略执行验收](../tasks/evidence/web-mobile-parity/2026-10-24-batch-4.md)。第 0～4 批客户端实现及 Android/iOS 独立运行通过；本批最新隔离提交 `1ea300be` 四项必需 CI 成功，原树 WIP 与原业务实源边界保留。末尾列出当前源码增量，实施前矩阵中的“缺少”保持其历史含义。

2026-10-25 第 5 批配置、来源与自动化增量见[本批验收及 Chrome 接续补验](../tasks/evidence/web-mobile-parity/2026-10-25-batch-5.md)。当前限定源码 `5c67b4fa` 四项必需 CI、双平台原生编译/安装及受控交互通过；Android 条款和官方地址传递、两端受控 OAuth 终态补验通过。有效客户端、真实账号授权/回调以及原模型、来源、调度和外发条件仍未验收，M29b、G5A/G5I 的当前状态由配套 Task 持有。

## 核心结论

实施前 Web 有 9 个一级业务入口；手机端只有投资组合、风险事件、账户三个简化入口。该基线手机端能读取组合估值和持仓卡片、读取风险事件、切换实际/模拟范围、切换主题与涨跌配色，并列出账户及永久删除满足服务端条件的空账户。

账户永久删除是现存写能力。因此，README 中“Mobile 当前是只读入口”的概括已经不够准确；不过账户创建、编辑、停用和重新启用仍未出现在手机端。不能把三个手机页签与 Web 三个完整模块等同，也不能据此计算功能完成比例。

Web 与 Electron 共用 `apps/desktop`；本次用户已明确选择 Android / iOS，迁移目标是扩充独立 React Native 应用。`apps/mobile` 的 Expo Web 导出也不等于主 Web 产品。

## 证据入口

| 事实                           | 当前源码或现行合同                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Web 的 9 项主导航              | `apps/desktop/src/views.ts:20`；`apps/desktop/src/app/routes.tsx`                                              |
| 手机端三个入口                 | `apps/mobile/src/index.ts:46`；`apps/mobile/src/App.tsx:55`                                                    |
| 手机组合仅展示汇总与持仓卡片   | `apps/mobile/src/components/MobilePortfolioScreen.tsx:45`                                                      |
| 手机风险仅展示事件             | `apps/mobile/src/components/MobileRiskScreen.tsx`                                                              |
| 手机账户查询和永久删除         | `apps/mobile/src/mobile-account.queries.ts`；`mobile-account.actions.ts`；`components/MobileAccountScreen.tsx` |
| 删除的业务资格、冲突和设备验收 | [永久删除规格](../specs/2026-09-14-permanent-account-deletion.md)                                              |
| 现有共享接口                   | `packages/api-client/src/index.ts` 及同目录各领域 client；`packages/schemas/src/`                              |
| Web 仍持有的领域 API 包装      | `apps/desktop/src/features/*/*.api.ts`；`features/shared/request.ts`                                           |
| Android 原生 CI                | `.github/workflows/ci.yml` 的 `mobile-android-native`                                                          |
| iOS 原生工程                   | `apps/mobile/ios/ThesisLedger.xcworkspace` 与共享 `ThesisLedger` scheme                                        |

源码入口及名称只证明相关实现存在；本轮没有重跑其测试。历史设备报告、旧 CI 和旧发布报告只适用于各自的输入版本，不能补齐新迁移的设备验收。

## 功能差异矩阵

“缺少”表示当前手机源码没有对应业务界面；“部分”表示仅覆盖下表列出的行为。每个编号都是迁移验收的稳定定位点；实施前须将合并列出的动作展开为逐项验收行，避免只按页面标题验收。

| 编号 | 功能与 Web 当前能力                                                | 手机端当前覆盖                                                           | 迁移要求                                                                    |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| B01  | 全局实际/模拟范围、账户上下文、加载/空/失败/陈旧状态、主题及涨跌色 | 部分：有范围、状态和主题/涨跌色；组合与风险共用旧 store                  | 保留状态语义；所有新模块共享范围，查询与草稿按服务地址、范围、账户隔离      |
| B02  | 连接服务与页面导航                                                 | 部分：编译期 `EXPO_PUBLIC_API_BASE_URL` 或模拟器默认地址；用组件状态切页 | 增加手机可用的连接设置、业务栈、返回行为与业务对象定位                      |
| P01  | 组合概览、账户范围与持仓观察                                       | 部分：总市值、成本、盈亏、现金和简单持仓卡片                             | 补筛选、明细、来源/陈旧原因与跨模块入口                                     |
| P02  | 交易视图、交易详情、平仓片段及复盘跳转                             | 缺少                                                                     | 保留交易身份、账户、实际/模拟范围和选中片段                                 |
| A01  | 账户创建、编辑、启停、永久删除                                     | 部分：账户列表和永久删除                                                 | 补齐创建/编辑/启停；复用删除资格、原生确认与 409 原因                       |
| A02  | 标的检索确认、手工持仓/基线录入、持仓移除/清空                     | 缺少                                                                     | 保留确认身份、时间与账本命令语义；破坏性操作单独确认                        |
| A03  | 持仓草稿审核、人工修订、选行提交、冻结状态                         | 缺少                                                                     | 迁移现行无模型路径；草稿保存与写账本确认分开                                |
| A04  | 截图上传及导入草稿入口                                             | 缺少                                                                     | 系统选择图片/文件并上传；解析可用性按现行服务端能力显示                     |
| A05  | 成交新增、更正、作废、恢复与审计                                   | 缺少                                                                     | 保留命令身份、修订冲突和原因；失败保留输入                                  |
| A06  | 确定性对账候选与明确确认                                           | 缺少                                                                     | 查看和选择不写账本；刷新中或候选失效不得提交                                |
| A07  | 现金观察、入账、跨账户转账、更正/作废/恢复                         | 缺少                                                                     | 金额、币种、账户及账本版本必须与 Web 一致                                   |
| A08  | 定期入账计划及发生项确认/跳过/重开                                 | 缺少                                                                     | 调度仍在 Server；手机消费计划与发生项                                       |
| A09  | 基金定投计划及发生项处理                                           | 缺少                                                                     | 复用现行费用、日期、状态和版本约束                                          |
| F01  | 收益历史、曲线、汇总、分层与配置分布                               | 缺少                                                                     | 相同账户范围、日期、基准币种、FX 合并输入得到相同服务端结果                 |
| F02  | 收益/配置目标编辑与保存                                            | 缺少                                                                     | 错误保稿、409 冲突、保存成功后刷新失败分开处理                              |
| R01  | 风险规则创建、编辑、删除/恢复、试算和扫描                          | 缺少                                                                     | 保留规则版本、可用性、试算与实际扫描区别                                    |
| R02  | 风险事件、通知、通知路由状态及审计                                 | 部分：简单事件列表                                                       | 补筛选、账户来源、通知与审计明细；不把读取失败显示为无事件                  |
| R03  | 策略风险应用与升级                                                 | 缺少                                                                     | 与策略版本、账户范围和服务端预览/确认合同一致                               |
| J01  | 单笔交易复盘：候选、事实、指标与草稿                               | 缺少                                                                     | 复用交易投影及不可用原因，保留对象身份                                      |
| J02  | 行为/区间复盘、快照与历史                                          | 缺少                                                                     | 保留日期边界、版本、不可变历史和保存行为                                    |
| J03  | 复盘 AI 解释、任务历史与引用                                       | 缺少                                                                     | 解释失败不覆盖确定性事实，引用能追到来源                                    |
| H01  | 研究列表、筛选、报告、引用、工具调用与历史                         | 缺少                                                                     | 先补完整阅读链路及分页，再接新研究                                          |
| H02  | 新研究、能力预检、重试预填及提交                                   | 缺少                                                                     | 保留能力预检、输入范围、服务端审计事实和失败语义                            |
| H03  | 研究比较/复核等现行入口                                            | 缺少                                                                     | 按原研究 Task 的实际就绪条件消费，不激活仍受控的写入或实验能力              |
| S01  | 策略库、新建、编辑、新版本及现有辅助编写入口                       | 缺少                                                                     | 可在手机完成定义/校验/明确确认，不能只查看版本                              |
| S02  | 回测任务创建、进度、取消/重试、详情、证据和权益 CSV 导出           | 缺少                                                                     | 复用 Canonical Run；支持离开页面和重启后重读状态                            |
| S03  | 净值回测准备、任务及结果                                           | 缺少                                                                     | 保留净值来源、准备与冻结状态、失败原因和证据                                |
| S04  | AI 实验、参数、比较、候选采用与结束                                | 缺少                                                                     | 复用实验/候选/版本关系；保留原激活和外部调用边界                            |
| D01  | AI Provider、凭证、模型、用途路由、生成设置与验证                  | 缺少                                                                     | 全部通过 Server；敏感输入提交后清空，不在手机保存 Provider 密钥             |
| D02  | 行情 Provider 凭证、启停、测试、账号能力、OAuth                    | 缺少                                                                     | 保留 Desired/Effective、准入与探针区别；OAuth 用系统浏览器和现有会话查询    |
| D03  | 行情路由策略、验证/重试、目录同步/进度与标的确认                   | 缺少                                                                     | 消费服务端策略和能力，不复制 Provider 选路规则                              |
| D04  | 市场详情：报价、K 线、净值、周期、复权、窗口和指标                 | 缺少                                                                     | 手势与分页适配手机，数据窗口及指标合同保持一致                              |
| D05  | 静态信息、交易单位/规则、新闻、公告与已收录原文                    | 缺少                                                                     | 展示原文/来源及部分失败；“本地历史资料”是查看已收录文档，不新增上传产品承诺 |
| D06  | 自动化任务创建/编辑/启停/删除、立即执行和历史                      | 缺少                                                                     | Server 执行；手机不承担后台调度，验收不自动外发通知                         |
| D07  | Provider 健康、质量问题、运行与通知失败诊断                        | 缺少                                                                     | 保留分页、错误详情和可见的恢复入口                                          |

主要对应的 Web 入口：`features/account-data/AccountDataPage.tsx`、`portfolio/PortfolioDashboard.tsx`、`performance/PerformanceDashboard.tsx`、`risk/RiskCenter.tsx`、`journal/review/JournalReviewWorkspace.tsx`、`ai/AiChat.tsx`、`strategy/StrategyDashboard.tsx`、`providers/ProviderSettings.tsx`、`market-data/MarketDataPage.tsx`。业务细节仍由各领域现行 Spec 拥有，本盘点不重新定义其规则。

## 实施前复用边界（2026-10-22）

1. `api-client` 已覆盖账户查询/永久删除、组合与交易、部分收益、行情读模型、Ledger、定期资金、复盘、研究及回测等能力。先核对每个方法，现成合同直接消费。
2. 账户管理、收益完整读写、风险规则、AI 运行/配置、策略/实验及部分 Provider 管理仍有 Web 本地 API 包装。应按领域补齐共享 client，并把原 Web 包装接回同一合同，不能让手机 import `apps/desktop`。
3. `api-client/src/index.ts` 当前约 660 行，不宜继续堆积领域职责。新增领域 client 沿用同目录 `*-client.ts` 模式；同样不能把 React DOM 类型搬进共享包。
4. Web 的截图输入依赖 `File`、`HTMLInputElement` 和 `FormData.set`；手机需要文件 URI 适配。回测 CSV 依赖 DOM 下载；手机需要文件保存/系统分享适配。
5. 行情图表使用 `lightweight-charts`，并读取 DOM、CSS、指针与键盘事件；不能直接 import 到 React Native。推荐先验证本地 WebView 图表适配，保留原生页面与数据请求。
6. Web 策略进度有事件流消费；手机可用 TanStack Query 的前台条件轮询达到相同状态可见性，后台停止、恢复时立即重读。最终业务状态仍来自 Server 持久化记录。
7. 当前 CI 有 Android debug 原生编译；未发现独立的 iOS 原生 CI job。iOS 工程已存在，应补稳定构建门禁，不能把过去的 Simulator 报告当成本次通过。

## 实施前边界与后续重核

- 当前手机“只读为主、账户永久删除例外”是已有范围；新目标由配套 Spec 提案定义，计划形成不等于实施授权或验收完成。
- 工作树正在变化；开始实施前必须复核新增路由、子页、操作按钮、请求及功能开关，保留已有通过证据的输入范围。矩阵漏项应更新本报告及对应验收责任，不能以一级模块全部出现判定完成。
- 未完成的实源、模型、通知、历史研究和发布门禁继续由原 Task 持有。本项目负责补齐客户端消费与设备证据；上游阻塞仍需在相应迁移项显式关联。
- 本轮未检查已部署 API 与手机网络可达性，也未测试 Android/iOS 的当前安装包。缺失这些证据不代表当前功能一定有故障，但无法据此声称端到端可用。

## 当前源码增量（2026-10-25）

| 基线入口 | 当前手机源码 | 共享请求合同 | 独立验收责任 |
| --- | --- | --- | --- |
| S01 策略定义与辅助编写 | `features/strategy-library`、`features/strategy-editor`、`features/strategy-authoring` | `strategy-definition-client.ts`、`strategy-authoring-client.ts` | C08a/C08b、M23a/M23b/M23c，分平台 G4 |
| S02 普通回测 | `features/backtest-setup`、`backtest-jobs`、`backtest-results` | 普通 Run 准备/预检/冻结及生命周期 client | C08c、M24a/M24b/M24c，分平台 G4 |
| S03 净值回测 | 同一回测工作区按 `kind=nav` 消费净值准备、任务与结果 | NAV V3 准备收据与 Run client | C08c、M25a/M25b，分平台 G4 |
| S04 优化实验 | `features/optimization-setup`、`optimization-results`、`optimization-adoption` | `strategy-optimization-client.ts` | C09a、M26a/M26b/M26c，分平台 G4 |
| R03 策略风险应用 | `features/strategy-risk` | `strategy-risk-client.ts` | C09b、M27，分平台 G4；DELETE 沿现行合同为软归档 |
| D01 AI 配置、模型与用途 | `features/ai-providers` | `ai-provider-client.ts` | C10a/C10b、M28a/M28b/M28c，分平台 G5 |
| D02 行情账号与 OAuth | `features/market-providers`、`features/provider-oauth` | `market-provider-control-client.ts`、`provider-oauth-client.ts` | C11a/C11b、M29a/M29b；真实授权/回调仍未完成 |
| D03 行情路由与目录 | `features/market-policy`、`features/market-catalog` | `market-policy-client.ts`、`market-catalog-client.ts` | C11c/C11d、M30a/M30b，分平台 G5 |
| D06 自动化管理与历史 | `features/automation` | `automation-client.ts` | C12a、M31；真实调度/外发由原执行任务持有 |
| D07 来源、质量与通知诊断 | `features/diagnostics` | `diagnostics-client.ts` | C12b、M32；查询失败不触发重发 |

以上手机路径以 `apps/mobile/src/` 为根，共享 client 位于 `packages/api-client/src/`。研究页接入独立策略导航，原五入口保留。Android 与 iOS 编译、安装指纹、自动交互、真实 API 恢复和当前 CI 已分别记录；当前 iOS Native CI 位于 `.github/workflows/ci.yml`，实施前“缺少 iOS CI”的记录不再代表当前状态。

普通及净值权益 CSV 在两端分别字节一致，原始金额不经过图表浮点显示取舍。当前产品使用说明已同步到根 README，最终说明与 CI 冻结源码分别交付；第 5 批完整运行验收、第 6 批与完整迁移，以及原 Provider、模型、队列/Worker、通知和预算门禁仍由配套任务持有，未改写成已完成。
