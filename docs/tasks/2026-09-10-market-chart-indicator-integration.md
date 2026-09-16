# 日线行情与技术指标联动实施任务

对应 Spec：[日线行情与技术指标联动 Spec](../specs/2026-09-10-market-chart-indicator-integration.md)

> 任务标识：market-chart-indicator-integration
> 计划适配日期：2026-09-13
> 状态：实现中（2026-09-16，图表交互精炼）
> 范围说明：本文件按当前代码重排任务。

## 执行约束

- 保留既有工作树修改；当前主仓与 DSA 基线需分别记录，禁止提交、推送、清理、重置或发布。
- 主仓负责 Schema/API Client、Server 产品契约与窗口/缓存转发、聚合兼容和 Desktop 图表；DSA 只负责既有指标计算层的日期序列 additive Contract、直接测试与必要中文文档。
- bars 与指标 points 继续复用现有 Market Detail 响应 section；不新增独立 chart service 或全局数据基础设施。
- 不新增 DSA 批量详情接口，不在 Server/Desktop 重算指标，不新增 Provider、分钟线、交易标记、成本线、风险线或测量。
- 主仓 UI 组件优先复用 `apps/desktop/components.json` 声明的 shadcn 组件、现有组件和原子类。T2 spike 后可引入必要的成熟图表包，并同步 Desktop package 与锁文件。
- 任何 `IndicatorV1` 历史 points 必须带日期、参数、计算版本和输入口径；口径无法证明时 fail-closed。

## 任务

- [x] T1：冻结跨仓历史指标序列契约与现状兼容映射
  - 覆盖验收标准：AC3、AC4、AC7
  - 依赖：无
  - 涉及范围：主仓 `packages/schemas/src/market.ts`、`packages/api-client/`、`apps/server/src/market/market-detail.service.ts`、`apps/server/src/market/market.service.ts` 和相关测试；DSA `api/thesis_ledger.py`、既有 `StockTrendAnalyzer` 适配和直接 Contract 测试/文档。
  - 完成条件：定义可选日期 points、null 预热、参数、engine/Contract 版本、完成状态、输入日期范围、providerRevision、复权口径、inputFingerprint 和 calculationAnchor；Server 转发 start/end/limit/参数/anchor 并将其纳入缓存 key、乱序响应校验和分页覆盖声明；旧 scalar 响应仍可解析；同一 DataFrame 计算出 MA5/10/20/60、MACD(12,26,9)、RSI(6,12,24) 的日期序列；窗口不足不以替代值冒充；可见窗口与预热窗口超过 DSA 365 条输入能力时返回参数错误。
  - 验证方式：DSA 离线 Contract/计算测试、主仓 Schema/API Client 契约测试、跨仓 payload fixture；记录 DSA HEAD 和主仓 HEAD。
  - 验收依赖：父级确认跨仓改动边界已满足；尽早完成一次真实 payload→主仓解析/聚合→Desktop 消费的纵向集成，fixture 通过不能写成在线可用。

- [x] T2：完成图表技术 spike 并实现统一 ChartPoint 与数据口径校验
  - 覆盖验收标准：AC2、AC3、AC4、AC6
  - 依赖：T1 的 points 契约
  - 涉及范围：Desktop `market-detail` 内纯函数/类型、图表技术 spike 和直接测试；如采用 Lightweight Charts，更新 Desktop `package.json` 与包管理器锁文件。
  - 完成条件：用官方文档和当前版本实测 K 线、成交量、双指标 pane、日期 crosshair、缩放/平移、容器卸载和数据缺口；选择可维护方案并记录理由。Bar、indicator points 按日期合并；校验 symbol/timeframe/provider/providerRevision/复权口径/inputFingerprint/calculationAnchor；缺失 OHLC/volume/indicator 保持 null；实时 quote 与历史选择数据分离；普通滚轮不被图表吞掉。
  - 验证方式：最小图表 spike、边界单元测试覆盖日期缺口、重复日期、预热 null、stale 和来源不一致；记录实际依赖版本和官方 API 入口。

- [x] T3：实现价格主图与成交量图层
  - 覆盖验收标准：AC1、AC2、AC4
  - 依赖：T2
  - 涉及范围：`apps/desktop/src/features/market-detail/MarketDetailCharts.tsx` 及其直接 UI 测试。
  - 完成条件：K 线/收盘线切换；完整 OHLC 且没有明确标为 incomplete 才绘制 K 线，unknown 以状态标签表达；成交量使用独立轴；日期轴和最新/选中图例可访问；图表占满容器宽度；最新已完成日线有价格标记，未完成状态不冒充收盘。
  - 验证方式：Desktop 定向组件测试、静态渲染可访问性断言、局部 typecheck。

- [x] T4：实现 MA 与 MACD/RSI 副图
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：T2、T3
  - 涉及范围：选定图表库的图层、图例和副图控件；复用 shadcn Tabs/ToggleGroup/DropdownMenu（如已安装）。
  - 完成条件：默认 MA5/20/60、MA10 可显隐；MACD 含 DIF/DEA/0 轴/柱，RSI 含 0–100/30/50/70 参考线；副图参数与选中日期值一致；缺值不补值。
  - 验证方式：组件测试覆盖图层显隐、指标切换、零轴/阈值和空值语义。

- [x] T5：接入详情容器、范围和历史窗口
  - 覆盖验收标准：AC5、AC6、AC7、AC10
  - 依赖：T1、T4
  - 涉及范围：`MarketDetailDialog.tsx`、`MarketDetailSections.tsx`、market-detail API/query 适配和测试。
  - 完成条件：证券 bars 与指标合并为一个图表区；基金复用同一范围/日期联动容器但只渲染 NAV history；范围仅展示实际 1d 覆盖；默认按 3 月展示；历史请求使用 start/end/limit 分页，单次 detail 响应受 90 上限约束但累计历史可多页，依据覆盖声明决定是否还有更多；刷新/加载不改变当前视图；可视区间涨跌幅按有效端点简单收益率计算；局部失败保留可见内容。
  - 验证方式：Desktop UI contract 测试覆盖股票、ETF、基金、partial/stale/empty/unavailable、ETF 无 chip/ATR 请求和实时概览隔离。

- [x] T6：实现日期联动、锁定、视图控制和偏好记忆
  - 覆盖验收标准：AC2、AC5、AC6、AC9、AC10
  - 依赖：T5
  - 涉及范围：图表交互状态、键盘事件、拖动/按钮缩放平移、全屏和全局 chart 偏好；复用现有 Dialog/shadcn 控件。
  - 完成条件：悬停、点击锁定、Esc 恢复最新；回到最新把可视区间移到末端且保留缩放比例，重置恢复默认范围与默认比例；刷新/加载不改变当前视图；全屏双副图；全局偏好跨标的复用图形、MA 可见性、副图、RSI6/12/24（默认 RSI12）、MACD(12,26,9) 参数；参数改变使请求 key、缓存失效和乱序保护生效；非法/不支持参数回退默认值；不保存数据与诊断；普通页面滚轮可继续滚动；关闭/切换标的不残留监听器。
  - 验证方式：Desktop 交互测试、键盘/ARIA 测试、参数 key/失效/乱序测试、全局偏好跨标的测试和窄宽度静态布局断言。

- [x] T7：完成主仓定向检查与包级构建
  - 覆盖验收标准：AC3、AC7、AC8
  - 依赖：T1–T6
  - 涉及范围：主仓受影响 packages/apps 及边界脚本。
  - 完成条件：Schema/API Client/Server/Desktop 定向测试通过；相关 typecheck/build/lint、边界与文件尺寸门禁通过；若 T2 选择图表包，锁文件与 package 依赖保持一致；不修改数据库 migration。
  - 验证方式：按“定向测试 → 包级测试与 build → 仓库门禁”执行，记录失败详情和既有告警。

- [x] G1：真实运行态与浏览器验收
  - 覆盖验收标准：AC1、AC2、AC5、AC6、AC7、AC8
  - 依赖：T7；DSA Contract/主仓 Server/Desktop 运行版本一致
  - 涉及范围：隔离本地运行环境、Desktop 页面和浏览器工具。
  - 完成条件：股票/ETF/基金 Network 能力矩阵正确；日期联动、锁定、Esc、范围、缩放、历史分页、回到最新保留比例、重置、全屏、双主题和异常状态可见；最新已完成日线价格标记和未完成可信状态正确；记录运行 revision、Contract version、截图路径和控制台结果。
  - 验证方式：必须使用 browser skill 检查 Network/DOM/交互/截图；真实 Provider smoke 单独标为观测证据，不能用 fixture 代替。
  - 当前证据：[运行态与性能验收](../benchmarks/2026-09-13-market-chart-runtime.md)；浏览器 DOM/交互/截图与同接口结构化 HTTP 采样共同验证能力矩阵，未导出 HAR。

- [x] P1：执行明确负载下的图表性能门禁
  - 覆盖验收标准：AC1、AC2、AC5、AC8、AC11
  - 依赖：T5、T6
  - 涉及范围：Desktop 生产构建页面和浏览器性能记录。
  - 完成条件：在 500 个日线点、K 线+成交量+双指标 pane、连续缩放/平移 10 秒负载下，初次绘制到可交互 ≤300ms，单次日期联动更新 ≤100ms，主线程不得出现 >200ms 长任务；记录设备、浏览器、构建 revision 和采样方法。
  - 验证方式：浏览器 Performance 面板或等价受控测量；该门禁只证明声明负载，不外推到无限历史。

- [x] R1：最终一致性 Review
  - 覆盖验收标准：AC1–AC11
  - 依赖：T7、G1、P1
  - 涉及范围：Spec、Task、ADR-005/008/011/014/015、主仓/DSA 变更和验证证据。
  - 完成条件：逐项检查契约、能力矩阵、非目标、测试证据和真实运行态；未通过门禁保持未勾选；父级完成 targeted diff review 后再接受。
  - 验证方式：使用本文件的最终 Review 清单；不提交、不推送。

- [x] T8：收敛右轴末值并建立选中日期分组读数
  - 覆盖验收标准：AC13；AC14 的分组与当前副图映射基础
  - 依赖：既有 T3–T6 已完成实现
  - 涉及范围：Desktop `MarketDetailCharts.tsx`、`MarketPriceLightweightChart.tsx`、边界判断纯函数或职责明确的读数组件，以及直接测试；不修改 Server、DSA、Schema、分页请求或指标计算契约。
  - 完成条件：辅助序列关闭右轴无名称末值；选中日期读数按价格、均线和当前实际绘制的 MACD/RSI 副图分组，不显示伪造数值。
  - 验证方式：组件定向测试覆盖辅助末值配置、分组、当前副图映射和不可比语义；Desktop typecheck 与受影响测试通过。
  - 2026-09-16 验证结果：辅助末值配置、读数组件分组/不可比省略及既有行情详情契约已覆盖；Desktop 全套测试 43 文件、312 项通过，`pnpm typecheck` 与 `pnpm build` 通过。构建保留现有大 chunk warning。随后修正普通模式读数只映射 `activePane` 的边界，定向 4 文件、14 项测试与 Desktop `pnpm typecheck` 再次通过。

- [x] T9：实现拖动加载、稳定读数槽位与图表 attribution
  - 覆盖验收标准：AC12、AC14、AC15
  - 依赖：T8
  - 涉及范围：Desktop `MarketDetailCharts.tsx`、`MarketPriceLightweightChart.tsx`、`MarketNavChart.tsx`、`MarketChartReadout.tsx`、职责明确的手势状态纯函数、直接测试和 `THIRD_PARTY_LICENSES.md`；不修改 Server、DSA、Schema、分页请求或指标计算契约。
  - 完成条件：指针拖动进入左侧未加载区域时每个手势只自动触发一次分页，初始布局/程序化移动/加载中不触发；失败后下一次手势可重试；历史空白区只显示非交互加载状态。读数区以不换行固定槽位保留当前已启用结构，日期缺值显示“—”且不改变高度。证券/NAV 图关闭内置 attribution 图标，并在图表口径区提供可访问文本来源链接；第三方 NOTICE 可追溯。
  - 验证方式：手势状态单元测试覆盖未拖动、进入边界、同手势重复、加载中、结束后重试；读数组件测试覆盖长短数值、缺值与稳定槽位；图表配置测试覆盖两类图表的 `attributionLogo: false` 与文本链接；Desktop 定向测试、typecheck、build、目标 ESLint 和 `git diff --check`。
  - 2026-09-16 验证结果：手势状态机覆盖初始/程序化范围不触发、同手势去重、加载中不重入和下一手势重试；读数组件覆盖当前 pane 映射、缺值槽位和防换行最小高度；证券/NAV 配置及文字 attribution 链接均有定向断言。定向测试 5 文件、17 项通过；Desktop 全量测试 45 文件、318 项通过，`pnpm typecheck`、`pnpm build`、目标图表 ESLint 与 `git diff --check` 均通过。构建保留现有大 chunk warning。

- [x] T10：建立日线工具栏分组与 pane 标题
  - 覆盖验收标准：AC16、AC17
  - 依赖：T9
  - 涉及范围：Desktop 日线工具栏、Lightweight Charts pane 标题封装及直接测试；不修改 Server、DSA、Schema、分页、指标计算、基金 NAV 控件或全局 CSS。
  - 完成条件：图形、区间、指标和视图均有可见分组标题且按组响应式换行；副图切换归入指标组。价格、成交量及当前实际绘制的 MACD/RSI pane 显示低干扰且状态一致的标题，普通/全屏 pane 映射正确，无额外右轴末值。
  - 验证方式：组件契约测试覆盖四个分组、组内控件归属与响应式结构；pane 标题纯映射或图表配置测试覆盖 K 线/收盘线、单副图和全屏双副图；随后执行 Desktop 全量测试、typecheck、build、目标 ESLint 与 `git diff --check`。
  - 2026-09-16 验证结果：`MarketChartToolbar` 将图形、区间、指标、视图作为可访问且不可拆分的换行单元，MACD/RSI 切换归入指标组；Lightweight Charts `createTextWatermark` 按实际 pane 创建并在图形、主题、指标或 pane 变化时先 detach 再重建。pane 纯映射覆盖 K 线/收盘线、单 MACD、单 RSI、全屏双副图及无 points；工具栏组件测试覆盖四组、控件归属和按组换行类契约。定向测试 6 文件、20 项通过；Desktop 全量测试 47 文件、322 项通过，`pnpm typecheck`、`pnpm build`、目标 ESLint 与 `git diff --check` 均通过。构建保留现有大 chunk warning。

- [ ] T11：优化指标下拉设置面板
  - 覆盖验收标准：AC18
  - 依赖：T10
  - 涉及范围：Desktop 指标下拉内容、职责明确的设置面板组件及直接测试；不修改 Server、DSA、Schema、指标计算、请求参数、基金 NAV、图表绘制或全局 CSS。
  - 完成条件：显示内容、MACD 参数、RSI 周期和均线周期具有清晰分区；MACD 输入分别标注快线/慢线/信号，应用与恢复操作保持单行；RSI/MA 使用紧凑分段选择；面板宽度受视口约束、超高时内部滚动，保留既有显隐、参数校验、偏好持久化与请求失效行为。
  - 验证方式：组件契约测试覆盖分区、控件标签、选中/禁用状态、参数回调、错误提示、宽度与内部滚动类；既有行情详情交互测试不回归；随后执行 Desktop 全量测试、typecheck、build、目标 ESLint 与 `git diff --check`。
  - 2026-09-16 当前结果：已提取 `MarketIndicatorSettingsMenu`，父组件仍拥有 preference、草稿和 MACD 校验/写入语义。定向测试 4 文件、13 项通过，Desktop 全量测试 48 文件、326 项通过，目标 ESLint 与 `git diff --check` 通过。`pnpm typecheck` 仅因本任务范围外的 `src/features/strategy/BacktestSetupDialog.tsx:116` 将 `string | undefined` 传入精确可选 `strategyName` 失败；遵循验证阶梯未执行 build，T11 保持未勾选。

- [ ] T12：将图表导航动作收敛为全屏旁图标组
  - 覆盖验收标准：AC19
  - 依赖：T10
  - 涉及范围：Desktop 日线工具栏、全屏按钮旁的图表导航组件及直接测试；不修改 Server、DSA、Schema、分页、缩放/平移算法、指标设置、基金 NAV 或全局 CSS。
  - 完成条件：放大、缩小、更早、更晚以统一图标按钮子组放置在顶部视图组内并紧邻全屏按钮；按钮具有可访问名称和悬停说明，回到最新、重置、全屏保持文字按钮；四个回调继续映射既有 `viewAction`。
  - 验证方式：组件契约测试覆盖位置、四个图标按钮、可访问名称/说明和回调映射；工具栏测试确认顶部不再接收导航按钮；随后执行 Desktop 受影响测试、typecheck、build、目标 ESLint 与 `git diff --check`。
  - 2026-09-16 当前结果：已提取 `MarketChartNavigationControls`，以统一边框图标子组呈现放大、缩小、更早和更晚，并放置在顶部视图组的全屏按钮旁；四个按钮具备 `aria-label`、`title` 并继续调用既有 `viewAction`，回到最新、重置和全屏保持文字按钮。Desktop 全量测试 49 文件、327 项通过；最终位置复跑 3 文件、7 项定向测试通过，目标 ESLint、Prettier 与 `git diff --check` 通过。typecheck 仍被范围外 `BacktestSetupDialog.tsx:116` 的既有精确可选属性错误阻断，按验证阶梯未执行 build，T12 保持未勾选。

- [ ] G2：完成交互精炼的浏览器验收
  - 覆盖验收标准：AC12、AC13、AC14、AC15、AC16、AC17、AC18、AC19
  - 依赖：T9、T10、T11、T12
  - 涉及范围：受控 Desktop 图表页面或与当前源码一致的本地运行态。
  - 完成条件：初始布局和程序化移动不加载历史；一次拖动进入左侧未加载区域只触发一次请求并显示非交互加载状态，下一次拖动可重试；右轴只保留主价格末值；跨不同日期、缺值和窄宽度切换时读数区不换行或抖动；证券与 NAV 图均无 TradingView 图标，文本 attribution 可访问；日线工具栏四组可辨识且按组换行，价格、成交量和实际副图标题在普通/全屏状态正确显示；指标设置面板在宽窄视口分区清楚、无文字截断或横向溢出，参数与选择交互可用；全屏旁图标导航子组位置清晰、悬停/键盘说明可用且四个动作正确。
  - 验证方式：使用 browser skill 检查 DOM、交互、截图和 Console；受控 fixture 只证明组件交互，不替代在线 Provider 可用性。
  - 2026-09-16 当前阻塞：当前源码的 `http://localhost:5173/` 可打开并进入 `510300.SH` 行情详情，但等待后仍持续显示“正在加载行情详情”，未出现图表；Console 未见 error/warn。未创建侵入式受控入口，故左侧拖动、右轴和窄宽可见验收保持未通过。
  - 2026-09-16 T9 后复验：重新建立本地浏览器会话后，导航至当前 Vite 入口的操作在浏览器控制层超时并重置，未取得新的图表 DOM、拖动或 Console 证据；不以自动化测试替代 G2，保持未通过。
  - 2026-09-16 T10 后状态：工具栏分组与 pane 标题仅通过确定性测试、类型检查和构建验证；沿用上述当前运行态图表未渲染/浏览器控制层超时的阻塞，未将自动化结果替代宽窄布局、普通/全屏标题或 Console 验收。
  - 2026-09-16 T10 浏览器尝试：浏览器会话可建立，但读取本地前端验收指引时控制层在 30 秒内超时并重置，未导航或操作页面；未产生新的 DOM、截图、拖动或 Console 证据，G2 保持未通过。
  - 2026-09-16 T11 后状态：菜单组件与全量 Desktop 测试通过，但当前 Desktop typecheck 受范围外 Strategy 文件阻断，按验证阶梯未继续 build 或浏览器操作；此前运行态图表未渲染和浏览器控制层超时的 G2 阻塞不变。
  - 2026-09-16 T12 后状态：全屏按钮旁的图标导航组与四个既有动作映射已通过组件、受影响交互和 Desktop 全量测试；同一范围外 typecheck 错误仍阻断 build，且未取得新的真实浏览器位置、悬停或键盘证据，G2 保持未通过。

- [ ] R2：2026-09-16 图表交互精炼最终 Review
  - 覆盖验收标准：AC12–AC19
  - 依赖：T9、T10、T11、T12、G2
  - 涉及范围：本轮 Spec/Task、Desktop 实现、定向测试与浏览器证据。
  - 完成条件：父级逐项核对用户反馈、既有分页/日期联动不回归、证据边界与工作树状态，未完成门禁保持未勾选。
  - 验证方式：使用本文件唯一的最终一致性 Review 清单；不提交、不推送。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 主图、成交量和副图结构 | T3、T4、T5 | T3/T4；G1 |
| AC2 / 日期轴、十字线、锁定与可访问交互 | T2、T3、T4、T6 | T2/T3/T4/T6；G1 |
| AC3 / DSA 日期 points、预热、版本与口径 | T1 | T1；G1 的真实 payload 检查 |
| AC4 / 同日期口径校验和缺失值语义 | T1、T2、T3、T4 | T1/T2/T3/T4；G1 |
| AC5 / 范围、缩放、历史加载、回到最新与重置 | T5、T6 | T5/T6；G1 |
| AC6 / 实时概览隔离和异常来源 | T2、T5、T6 | T5/T6；G1 |
| AC7 / 股票、ETF、基金能力矩阵与旧接口兼容 | T1、T5 | T1/T5/T7；G1 |
| AC8 / 工程检查和浏览器证据 | T7 | T7；G1；R1 |
| AC9 / 全局偏好与指标参数 | T6 | T6；G1；R1 |
| AC10 / NAV 复用联动交互 | T5、T6 | T5/T6；G1；R1 |
| AC11 / 明确负载性能门禁 | P1 | P1；R1 |
| AC12 / 指针拖动进入左侧未加载区域时每手势触发一次分页 | T9 | T9；G2；R2 |
| AC13 / 右轴只保留主价格末值 | T8 | T8；G2；R2 |
| AC14 / 选中日期读数固定槽位、缺值与防抖动 | T8、T9 | T9；G2；R2 |
| AC15 / 图内无 attribution 图标且来源披露可访问 | T9 | T9；G2；R2 |
| AC16 / 日线工具栏按图形、区间、指标和视图分组 | T10 | T10；G2；R2 |
| AC17 / 价格、成交量与实际副图 pane 标题 | T10 | T10；G2；R2 |
| AC18 / 指标下拉设置面板分区与窄视口可用性 | T11 | T11；G2；R2 |
| AC19 / 全屏按钮旁的图标导航组 | T12 | T12；G2；R2 |

## 依赖与证据边界

- T1 是唯一跨仓契约任务；T2–T6 只能依赖其已验证字段和语义，不得自行发明日期索引或计算公式。T1/T3 完成后应先跑一次真实 payload→主仓解析/聚合→Desktop 渲染的早期集成，不拖到 G1。
- T7 的通过只证明代码、契约和确定性测试；不证明 DSA 在线 Provider、Docker 镜像或浏览器真实 Network。
- G1 必须使用与 T1/T7 对应的主仓和 DSA revision；旧 Server、旧 DSA 镜像或 stale cache 只能作为环境阻塞记录。
- DSA、infra 和主仓的工作树状态分别记录；不创建数据库 migration；图表包若经 T2 选定，依赖与锁文件按包管理器一起更新。

## 当前执行记录

- 2026-09-13：已完成主仓/DSA 定向盘点；当前指标仅返回最新 scalar，历史联动需要 DSA additive points 契约。
- 2026-09-13：Spec/Task 已按当前代码适配，规划审查通过，开始 T1。
- 2026-09-13：T1 已完成。DSA 新增日期 points、预热 null、参数归一化、真实计算输入首日 anchor 和统一逐日输入指纹；主仓 Schema/API Client/Server 已转发窗口与参数并纳入缓存键。DSA 定向测试 13/13、Schema 契约测试 41/41、Server 行情定向测试 33/33 通过。
- 2026-09-13：T2/T3/T4 实现继续推进。Desktop 采用 `lightweight-charts@5.2.1`，已接入 K 线/收盘线、MA5/20/60 默认叠加（MA10 可显隐）、成交量、MACD 柱状图与 DIF/DEA、RSI6/12/24 选择及 0–100/30/50/70 参考线；普通滚轮交给页面，图表拖动和缩放仍可用。新增 `market-chart-model` 统一日期域、缺口空白、逐日 fingerprint、provenance 日期范围和逐指标 anchor 校验，缺证据时 fail-closed；旧指标进度条和隐藏测试标记已移除，NAV 图表拆分为独立文件。参数草稿确认限制为整数 2–200 且快线小于慢线，RSI 周期仅控制显示，服务端参数进入 TanStack Query key 并重新读取 DSA points。Desktop 定向测试 245/245、typecheck 通过；仍待包级 build、真实浏览器交互证据。
- 2026-09-13：详情容器支持单次 90 条窗口的 `end` 分页请求、日期去重合并和日期锚点；响应增加 `limits.barsHasMoreBefore`，空/重复页和失败状态保留当前图表并可重试。范围按日历月计算且未覆盖时不切换，回到最新按当前跨度移动末端，重置恢复默认偏好和比例。全屏采用 shadcn `Dialog`/Portal 并在全屏时同时展开 MACD 与 RSI pane；Esc 先解除锁定再退出全屏。NAV 保留净值日期、单位净值和来源语义，证券指标不会发给基金能力。
- 2026-09-13：本地 Vite 已切换到 `http://127.0.0.1:5174/`；受控图表 review harness 已取得真实组件的浏览器证据，确认证券图表高度、3 月首屏范围、缩放平移、RSI pane 和全屏布局修复有效。该 harness 使用受控数据，只作为组件交互证据，不替代真实 Provider Network 验收。
- 已执行：DSA `tests/test_thesis_ledger_core_facades.py` 6/6、`py_compile`；Server 行情定向测试 33/33；Schema 全套测试 168/168；Desktop 定向测试 245/245；Desktop typecheck。上述证据覆盖代码和确定性测试，不替代真实 Provider、运行态浏览器或性能门禁。
- 2026-09-13：Schema 与 API Client build 通过。初次尺寸检查未提供基线，只能视为 warning-only；随后使用 HEAD 基线发现两处服务超限，按指标请求与参数校验职责提取后通过。此前 Server build 错误来自旧 domain dist，刷新 domain 构建产物后通过。
- 2026-09-13：最终 Desktop 全套测试 245/245、typecheck 和 build 通过（Vite 2898 modules）；Server 行情定向测试 35/35、Server build、修改文件 ESLint、import boundary 和 `GUARDRAIL_BASE_REF=HEAD` 文件尺寸 ratchet 均通过。ratchet 仅保留 9 个既有 warning，无新增 error。详情 NAV 请求统一使用 90 条窗口，NAV 与证券图表均按实际已加载日期校验范围；指标菜单按 Base UI `Menu.Group`/`Menu.RadioGroup` 契约修复，Escape 菜单交互已覆盖生产复验。
- 2026-09-13：父级完成 G1/P1：真实 DSA/Server/浏览器链路覆盖股票、ETF、基金陈旧净值、参数更新、历史分页、日期锁定、范围控制、全屏与主题。500 点双副图首次绘制 98ms、10 秒 100 次操作 p95 22ms、5 次日期联动最大 23ms，未观察到 >200ms 长任务。详细边界见运行态与性能验收记录。
- 2026-09-16：根据实际页面反馈重开交互精炼范围，新增 T8/G2/R2；既有 T1–T7、G1、P1、R1 证据保持为 2026-09-13 基线，不替代本轮可见 UI 验收。规划审查结论为 `Ready`：AC12–AC14 均有单一实现责任、定向验证与浏览器门禁，无 Blocking 问题，不改变跨仓数据契约。
- 2026-09-16：交互目标收敛为指针拖动进入未加载区域后每手势触发一次分页，并增加稳定读数槽位与 attribution 迁移；新增 T9，G2/R2 依赖相应更新。规划审查结论为 `Ready`：手势状态、读数布局和许可证披露均有实现与验证责任，无 Blocking 问题。
- 2026-09-16：根据实际页面继续补充可发现性范围，新增 T10：工具栏以四个可见语义组组织，价格、成交量和实际指标 pane 显示对应标题；G2/R2 扩展到 AC16–AC17。规划审查结论为 `Ready`：仅调整 Desktop 表达层，不改变数据或分页契约。
- 2026-09-16：根据指标菜单窄宽与信息密度反馈新增 T11，将既有控件重组为视口受限、内部滚动的四区设置面板；G2/R2 扩展到 AC18。规划审查结论为 `Ready`：仅重组既有 Desktop 控件与回调，不改变指标参数、偏好或请求契约。
- 2026-09-16：根据图表导航层级反馈新增 T12，将缩放和时间平移收敛为顶部视图组内、紧邻全屏按钮的统一图标子组；G2/R2 扩展到 AC19。规划审查结论为 `Ready`：复用既有四个 `viewAction`，不改变算法或历史分页语义。

## 最终一致性 Review

- [ ] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [ ] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [ ] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [ ] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [ ] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [ ] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [ ] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：T8、T9、T10 实现与自动化验证通过；T11、T12 已实现且确定性测试通过，但受范围外 Desktop typecheck 失败阻断，保持未完成。G2 真实浏览器验收仍受运行态阻塞，依赖这些门禁的 R2 保持未完成。2026-09-13 原范围 Review 仍有效。
- 已确认的问题及责任任务：T8 已收敛右轴末值与分组读数基础；T9 已实现拖动加载状态机、稳定读数槽位和 attribution 迁移；T10 已完成工具栏可见分组与 pane 标题；T11 负责指标设置面板的信息层级与窄视口可用性；T12 负责全屏按钮旁的图标导航组。
- 尚未通过的必要门禁与阻塞原因：T11、T12 仍需范围外 `BacktestSetupDialog.tsx:116` 的 TypeScript 错误被其所有者修复后重跑 typecheck/build；G2 仍需在可渲染当前图表的运行态验证既有交互与新增 UI。当前本地行情详情未提供图表 DOM，浏览器控制重连后导航又发生超时，故不宣称可见验收通过。
- 遗留风险或已确认的后续范围：分钟线、交易标记、成本线、风险线和测量仍不在本轮范围；在线 Provider 可用性不由受控 UI fixture 证明。
- 验证命令/过程、结果与证据引用：T8 证据保留；T9 定向断言、Desktop 45 文件 318 项测试、typecheck、build、目标 ESLint 与 `git diff --check` 均通过。T10 定向 6 文件 20 项、Desktop 全量 47 文件 322 项测试、typecheck、build、目标 ESLint 与 `git diff --check` 通过；父级复查 watermark 生命周期并要求在 series 增删前 detach，修正后复跑 3 文件 8 项定向测试、Desktop typecheck 与 `git diff --check` 通过。T11 定向 4 文件 13 项、Desktop 全量 48 文件 326 项测试、目标 ESLint 与 `git diff --check` 通过；父级复跑 4 文件 13 项定向测试、目标 ESLint 与 `git diff --check` 通过，并复现同一范围外 typecheck 错误。T12 完成后 Desktop 全量 49 文件 327 项测试、目标 ESLint、Prettier 与 `git diff --check` 通过；typecheck 仍为同一范围外错误，build 和浏览器未执行。浏览器证据边界见 G2。
- 提交状态：不提交、不推送；保留既有工作树修改。
