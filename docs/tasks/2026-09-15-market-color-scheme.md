# 涨跌配色配置实施任务

对应 Spec：[涨跌配色配置 Spec](../specs/2026-09-15-market-color-scheme.md)

> 状态：实现完成；Desktop 运行态已验收，Mobile 运行态待验收

## 任务

- [x] T1：建立金融涨跌色与固定状态色的端内语义契约及 Desktop/Mobile 颜色映射。
  - 覆盖验收标准：AC3、AC4
  - 依赖：无
  - 涉及范围：Desktop tokens/基础样式/金融消费点与 Mobile theme/金融数值展示；不修改计算和状态判定。
  - 完成条件：所有纳入范围的金融涨跌消费点读取可变语义色，固定状态消费点保留固定语义，零值和缺失值行为有测试。
  - 验证方式：定向颜色映射、组件渲染和图表颜色测试。
  - 验证证据：Desktop 涨跌配色契约测试通过 3 项，包含主题 switch、独立入口及收起侧栏纵向排列契约；Mobile 涨跌配色测试通过 4 项，包含异步读取竞态与失败后的串行保存恢复。

- [x] T2：实现 Desktop 涨跌配色偏好、localStorage/storage 同步与独立设置入口。
  - 覆盖验收标准：AC1、AC2
  - 依赖：T1 的语义颜色契约
  - 涉及范围：Desktop market-color context、AppShell/窄屏入口、现有 `ThemeToggle` switch 与 shadcn 组件组合；不新增 API。
  - 完成条件：两种选项可操作，默认/非法/读写失败行为明确，切换即时更新且提示失败。
  - 验证方式：Desktop 定向测试、包级 typecheck/test/build；检查 `components.json`、packageManager 和现有组件 API。
  - 验证证据：Desktop typecheck、build 和定向 ESLint 通过；浏览器确认原有 `ThemeToggle` switch 保留，涨跌配色以相邻独立按钮提供，红涨绿跌/绿涨红跌切换即时生效，刷新后恢复选择。收起侧栏后两个入口仍保留，源码与契约测试确认使用纵向居中原子类排列。

- [x] T3：接入 Desktop Market Detail 图表的增量颜色更新。
  - 覆盖验收标准：AC3、AC5
  - 依赖：T1、T2 的语义颜色和变化通知契约
  - 涉及范围：K 线、成交量、MACD series 的 `applyOptions` 更新；不重建 chart、不重置视窗/十字光标、不改变数据请求。
  - 完成条件：偏好变化后现有图表所有金融颜色即时一致，视窗/指标/十字光标状态保留。
  - 验证方式：图表定向测试与 Desktop 浏览器最小验收。
  - 验证证据：Desktop 定向测试共 3 个文件、11 项通过，包含 `MarketPriceLightweightChart.test.ts` 3 项；浏览器在已打开行情详情中切换配色后，15 个 canvas 保持，时间范围仍为 `2026/8/17 至 2026/9/15`，锁定十字光标仍为 `2026/9/1`。

- [x] T4：实现 Mobile 持久化、竞态保护、设置交互和金融数值着色。
  - 覆盖验收标准：AC1、AC2、AC3、AC4
  - 依赖：T1 的 Mobile 颜色语义契约
  - 涉及范围：Expo 兼容存储适配、App/theme/UI/tests；若新增依赖需维护 package/lockfile；不新增 Mobile 图表。
  - 完成条件：切换即时生效，重启恢复，异步读取和连续保存顺序安全，失败有可见提示，固定状态色不变。
  - 验证方式：Mobile 定向测试、typecheck/test/build；按环境执行 Android/iOS Native compile。
  - 验证证据：Mobile 3 个测试文件共 19 项通过，typecheck/build 通过；`@react-native-async-storage/async-storage` 已对齐 Expo 兼容的 `2.2.0`，Pods 自动链接后 iOS Simulator Debug 原生编译通过并包含 `RNCAsyncStorage`。Android 原生编译因环境没有 Java Runtime 阻塞；Mobile ESLint 被仓库 ESLint 解析 React Native Flow 源码阻塞。`expo install --check` 不再报告 AsyncStorage，仅保留既有 Expo/React Native patch 版本漂移。

- [ ] I1：跨端产品验收与证据汇总。
  - 覆盖验收标准：AC1–AC6 的组合行为
  - 依赖：T1–T4 完成；Desktop 运行态与 Mobile Native 环境可用
  - 涉及范围：Desktop 浏览器两种配色、刷新恢复、已打开图表保留视窗/十字光标；Mobile 运行态恢复。不可用环境不得用单元测试替代。
  - 完成条件：可执行的运行态证据记录，未执行门禁明确标为未验收。
  - 验证方式：browser skill 最小真实验收；真实模拟器/设备或精确阻塞记录。
  - 验证证据：Desktop 浏览器已完成两种配色、刷新恢复及已打开图表的视窗/锁定十字光标保持验收；收起侧栏的入口存在性已确认，精确几何测量因 Browser 自动审查超时未取得。Mobile 真实模拟器/设备的启动恢复仍未验收；Native compile 结果见 T4。

## 验收映射

| AC / 断言 | 实现责任任务 | 验证责任任务或门禁 |
| --- | --- | --- |
| AC1 / 两端选项、默认、立即生效 | T2、T4 | T2、T4、I1 |
| AC2 / 本机持久化、同步、竞态与失败提示 | T2、T4 | T2、T4、I1 |
| AC3 / 金融颜色与零值/缺失值规则 | T1、T3、T4 | T1、T3、T4、I1 |
| AC4 / 固定状态色不变 | T1、T2、T4 | T1、T2、T4 |
| AC5 / 图表状态保留 | T3 | T3、I1 |
| AC6 / 分层验证证据 | T1–T4 | I1 与各任务定向验证 |

## 规划前置 Review

- 结论：Ready with non-blocking assumptions
- 范围：T1–T4 本地实现与验证，I1 产品运行态门禁。
- Blocking：无；两端真实运行环境可用性属于后续证据门禁。
  - 非阻塞默认：Desktop 在 `ThemeToggle` switch 旁使用 shadcn `DropdownMenu` 提供独立配色入口；Mobile 使用已维护 package/lockfile 的 Expo 兼容 `@react-native-async-storage/async-storage`。

## 最终一致性 Review

- [x] Spec 的全部验收断言均有明确实现与适当验证
- [x] 所有已勾选任务满足自身完成条件且证据仍有效
- [ ] 必要集成、真实运行态与条件性门禁均已通过或有合法不适用依据（Mobile 产品运行态仍待验收）
- [x] 启动依赖、验收依赖与契约就绪证据正确且无循环
- [x] 跨任务接口、类型、状态、时间、错误与副作用语义一致（如适用）
- [x] 不存在未解决的设计 Blocking 问题、占位要求或未定义契约
- [x] 实现未超出 Spec 范围，未把可选设施变成强制要求
- [x] 证据类型、场景覆盖、代码版本与目标环境支持所声明的部分验收结果
- [x] 测试、配置、文档、Spec/Task 状态与实际实现一致
- [x] 必要实施 Step 已验证；提交处理符合授权且保留既有用户修改
- [x] 未发现未处理的实现、Spec、任务或验收证据不一致

### Review 结论

- 结论：部分通过；实现完成，Desktop 产品运行态通过，Mobile 产品运行态仍待验收
- 已确认的问题及责任任务：无
- 尚未通过的必要门禁与阻塞原因：Mobile 真实模拟器/设备运行态未执行；Android 原生编译环境缺少 Java Runtime
- 遗留风险或已确认的后续范围：Mobile 冷启动恢复与真实交互仍需在可用模拟器/设备上验证，不得用静态检查替代
- 验证命令/过程、结果与证据引用：Desktop build/typecheck/定向测试/ESLint 及浏览器验收通过；账户选择组件拆分后的契约检查已对齐实际消费点，Desktop 全量测试 41 个文件、305 项全部通过；Mobile 19 项测试、typecheck/build 与 iOS Simulator Debug 原生编译通过。
- 样式约束证据：本功能新增界面仅使用 Tailwind 原子类和既有 shadcn 组件；`rg` 未发现新增 `.appearance-*`、`.market-positive`、`.market-negative` 或 `.status-positive` CSS 选择器，配色契约仅保留 CSS 变量。
