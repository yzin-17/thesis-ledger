# 市场数据缓存与 Provider 路由交互实施任务

对应 Spec：[`../specs/2026-09-08-market-data-cache-and-provider-routing.md`](../specs/2026-09-08-market-data-cache-and-provider-routing.md)

## 任务

- [x] T1：补齐四类市场数据的读穿缓存
  - 覆盖验收标准：AC1、AC2
  - 依赖：无
  - 涉及范围：MarketService、MarketBarCache、实时行情/基金净值历史/筹码摘要缓存策略与 Server 测试。
  - 完成条件：实时行情、日线 Bar、基金净值历史和筹码摘要具有明确的新鲜/最后有效缓存窗口；相同普通请求不重复访问 DSA；范围键、刷新和失败回退语义可验证。
  - 验证方式：Schema 契约测试、Server 市场服务测试、Prisma 生成/类型检查。

- [x] T2：接通 11 个 DSA Provider 的路由配置与运行时适配
  - 覆盖验收标准：AC3、AC5
  - 依赖：无
  - 涉及范围：DSA Provider manifest、Control Contract、Schema、DSA 文档与测试。
  - 完成条件：注册表包含 DSA 内置的 11 个 Provider；每个 Provider 都可通过能力校验写入 Desired Policy，并具有可执行的 runtime 适配器；环境配置型 Provider 能正确反映 DSA 运行环境中的凭证状态。
  - 验证方式：相关 pytest、Python 编译检查、Control/Data Contract 定向测试。

- [x] T3：收敛 Provider 清单与市场数据页
  - 覆盖验收标准：AC3、AC4、AC6
  - 依赖：T2
  - 涉及范围：市场数据类型、TanStack Query、Provider 配置面板、路由策略面板、市场数据页、Market Detail 来源展示与 Desktop 测试。
  - 完成条件：Provider 清单完整展示 11 个 DSA 数据源、市场覆盖、配置方式和可用状态；全部 Provider 提供配置动作，并按能力与标的类型进入主备下拉；市场数据页没有缓存状态入口或残留请求。
  - 验证方式：Desktop 组件测试、类型检查、构建、真实浏览器选择与布局检查。

- [x] T4：完成跨仓回归与最终一致性 Review
  - 覆盖验收标准：AC7
  - 依赖：T1、T2、T3
  - 涉及范围：三仓目标测试、边界门禁、差异卫生、必要的本地运行时抽查与实施文档证据。
  - 完成条件：验证结果与 Spec/任务状态一致；失败或外部阻塞被明确记录，未通过项不勾选。
  - 验证方式：执行任务中记录的命令并逐项核对全部 AC。

- [x] T5：收敛市场数据页的信息层级与一级 Tab
  - 覆盖验收标准：AC8
  - 依赖：T3
  - 涉及范围：MarketDataPage、既有 Tabs 组件组合、Desktop 市场数据组件测试和浏览器交互验证。
  - 完成条件：路由策略、数据源、标的目录分别进入独立 Tab且默认显示路由策略；顶部仅保留紧凑状态摘要，不展示技术版本号；数据源面板没有重复标题，11 个 Provider 的状态与操作区保持一致；切换不丢失页面级草稿；窄屏 Tab 列表可横向滚动。
  - 验证方式：Desktop 目标测试、类型检查、生产构建、真实浏览器布局与 Tab 切换检查。
  - 验证证据：目标测试 6 项通过；Desktop TypeScript 检查、目标 ESLint 与生产构建通过；浏览器确认路由策略默认打开、页面不再展示技术版本号，数据源面板完整展示 11 行且宽屏操作列对齐；800×720 视口无横向溢出，键盘焦点配合 Enter 可切换 Tab。

## 最终一致性 Review

- [x] Spec 中的全部验收标准均有对应实现
- [x] 所有已勾选任务均有验证证据
- [x] 所有任务依赖均已满足且无错误阻塞关系
- [x] 跨任务接口、类型和命名保持一致（如适用）
- [x] 不存在未解决的 Blocking 问题、占位描述或未定义的实现契约
- [x] 实现未超出 Spec 声明的范围
- [x] 测试策略、测试实现与验证结果一致
- [x] 测试与文档已同步更新
- [x] 必要实施 Step 均已验证；如已获提交授权，已形成合理 commit，否则已记录提交状态或建议边界
- [x] 未发现实现、Spec 与任务文档之间的不一致

### Review 结论

- 结论：通过。市场数据页默认进入路由策略，技术版本号已从首屏与对应面板移除，Provider 清单层级和操作布局已收敛；11 个 Provider 路由能力与既有缓存行为保持不变。
- 发现的问题：无本轮阻断问题；生产构建仅报告既有的大 chunk 提示。
- 遗留风险：当前路由契约没有市场维度，面向特定市场的 Provider 需要依靠运行时不覆盖错误触发备用源；本轮信息层级调整未重复执行跨仓全量回归。
- 验证命令与结果：
  - DSA：相关 pytest 共 59 项通过；Python 编译检查通过；容器内 11 个 Provider runtime adapter 均可实例化。
  - Schema：类型检查通过，9 个测试文件共 108 项通过。
  - Server：50 个测试文件共 417 项通过。
  - Desktop：本轮目标组件测试 6 项通过，类型检查、目标 ESLint 和生产构建通过。
  - 运行时：`dsa` 与 `thesis-ledger` 容器使用新镜像重建后均为 healthy；Provider API 返回 11 项且不再包含 `routeEligible`。
  - 浏览器：市场数据页展示 11 个可配置路由；`DAILY_BAR / STOCK` 主数据源下拉包含全部 11 个 Provider，并对缺少环境凭证的来源标注“未配置”。
  - Tab 目标验证：页面默认显示“路由策略”，鼠标和键盘均可切换任务；可见区域无策略 revision 或目录 generation，数据源面板无重复 Provider 标题。
  - 页面长度：1280×720 视口下路由策略文档高度为 1143px；数据源面板完整渲染 11 行。800×720 视口下页面无横向溢出，Provider 操作区自然换行。
  - 差异卫生：ThesisLedger 与 DSA 两仓 `git diff --check` 均通过；本轮未获提交授权，保持未提交状态。
