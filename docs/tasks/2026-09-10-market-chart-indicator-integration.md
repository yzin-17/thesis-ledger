# 日线行情与技术指标联动实施任务

对应 Spec：[日线行情与技术指标联动 Spec](../specs/2026-09-10-market-chart-indicator-integration.md)

> 任务标识：market-chart-indicator-integration
> 计划适配日期：2026-09-13
> 状态：已完成（2026-09-13，独立本地环境验收通过）
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

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [x] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致
- [x] 不存在未解决的 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：本期实施与独立本地运行态验收通过。
- 父级审查：逐项检查跨仓契约、页级输入来源与日期指纹、请求参数与竞态、图表生命周期、能力裁剪、非目标和验证证据；浏览器发现的 RSI、菜单、视图范围与布局问题均已修复并复验。
- 验证结果：DSA 定向测试、Schema 168/168、Server 行情测试 35/35、Desktop 245/245、相关包构建/类型检查、修改文件 ESLint、边界与 HEAD 尺寸 ratchet 通过；G1/P1 证据见[运行态与性能验收](../benchmarks/2026-09-13-market-chart-runtime.md)。
- 环境边界：原开发数据库缺少已有风险模块表，本次保留原库，使用独立数据库执行全部现有 migration 完成验收；没有宣称原环境升级或生产发布完成。
- 后续范围：分钟线、交易标记、成本线、风险线和测量仍未纳入本期；性能只对已记录的设备与 500 点负载成立。
- 提交状态：主仓与 DSA 改动保留在工作树，未提交、推送或发布。
