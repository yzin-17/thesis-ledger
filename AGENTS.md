# 项目 Agent 规则

## 请求与工具函数

- 发起或读取服务端请求时，优先使用 TanStack Query 管理查询、缓存、加载/错误状态及请求竞态。
- 防抖、节流等常用工具函数优先使用 `es-toolkit` 提供的实现，不得自行重复实现；若确实不适用，需说明原因。
- 涉及 `es-toolkit` 函数选型、lodash 替换、工具函数新增或重构，以及相关 review 时，必须使用 `recommend` skill。先检查当前项目的实际依赖、源码和官方文档，确认函数存在、签名、行为和导入路径，不得仅凭记忆推荐；存在多个候选时，按 skill 要求给出对比和选择条件，没有合适函数时明确说明并考虑原生 JavaScript 方案。

## 代码表达

- 不使用多重嵌套三元表达式；复杂状态判断应使用清晰的 `if / else if` 条件分支或独立函数。

## 架构与模块边界

- Server feature 的源码依赖方向必须与 Nest Module 和领域依赖方向一致；核心/下游模块不得反向 import 上游适配层。例如 `ImportModule -> LedgerModule` 时，`ledger/**` 不得反向依赖 `imports/**`。
- 跨 feature 复用代码前必须先确认概念所有权：优先放回真正拥有该领域概念或契约的模块，由调用方单向消费；只有稳定、无业务编排且确实跨应用复用的能力才提升到 `packages/*`。
- 修复反向依赖时不能只为改变 import 方向而机械搬文件；Provider、截图来源、外部协议 DTO 等适配器专属概念必须继续留在适配层，核心模块只接收稳定的通用契约或领域原语。
- 不得为了消除循环依赖、缩短 import path 或临时复用而新增无明确所有权的 `common`、`shared`、`utils` 大杂烩；需要共享时应能说明其稳定边界和依赖方向。
- 修改模块 import/export、跨 feature 依赖或共享层职责时，必须同步检查并维护 `scripts/check-boundaries.mjs`；已确认的非法依赖模式应尽量固化为自动门禁，而不是长期依赖人工 Review。
- 涉及跨模块架构、契约、工程门禁等系统性改动时，按 `docs/DOCUMENTATION-GUIDE.md` 先建立成对的 `docs/specs/YYYY-MM-DD-<topic>.md` 与 `docs/tasks/YYYY-MM-DD-<topic>.md`，再实施代码修改。

## 复杂度与职责收敛

- 已超过项目复杂度或文件尺寸阈值的存量文件视为技术债 ratchet：后续修改不得继续增加其规模；新增职责应优先提取为边界明确的纯函数、domain helper、repository/query、orchestrator 或独立组件。
- 不得通过提高阈值、关闭 guardrail、增加 ignore，或把代码机械切成无语义的小文件来规避复杂度门禁；确需调整阈值时必须在对应 Spec/Task 中说明原因和新的约束。
- 大文件拆分以职责和依赖方向为依据，不以“达到某个行数”作为唯一目标；已有稳定行为应优先保持，避免借复杂度治理做无关的大规模重构。

## 原生客户端验证

- `apps/mobile/android`、`apps/mobile/ios` 属于实际维护的原生工程；`tsc`、前端 `build` 或单元测试不能替代 Native compile。
- 修改 React Native/Expo 原生依赖、Gradle、AndroidManifest、Podfile、Xcode 工程、原生插件或构建配置时，必须执行与平台匹配的原生编译验证，并保持对应 CI 门禁可用；不得用跳过 Native job 的方式掩盖真实构建问题。

## 仓库卫生

- 已被 `.gitignore` 覆盖的生成目录、缓存、安装包和发布产物不得继续被 Git 跟踪；发现历史遗留的 `.expo/`、`release/`、`*.apk`、`*.aab`、`*.ipa` 等产物时，应从 Git 索引清理，发布文件改由 CI artifact 或 Release 承载。
- 新增构建产物前先确认其是否属于源码或可复现输入；可由构建流程重新生成的二进制和缓存默认不进入仓库。

## 前端样式

- 修改或新增界面样式时，必须优先使用项目现有的原子类直接组合样式。
- 除非原子类、组件变体和可组合的 `className` 无法表达需求，否则不得新增传统 CSS class、选择器或页面级样式；确需新增时应说明原因，并尽量局部化。
- 不要为了单个视觉场景新增渲染分支、重复渲染组件或专用选择器；需要差异时，优先通过共享组件的语义化变体或可组合的 `className` 解决。
- 不要使用 Tailwind 的 `!` 修饰符或 CSS `!important` 作为常规样式覆盖手段。只有在确认原子类、组件变体和 CSS 层级都无法解决后，才可使用，并需说明原因。
- 保留现有 DOM、交互、数据接口和业务行为；视觉调整应尽量局部化。

## 表单标签交互

- 不得依赖 HTML `<label>` 的默认激活行为（包括 `htmlFor`/`for` 关联或用 `<label>` 包裹控件）让点击标签聚焦、打开或切换表单控件。表单标签只用于说明；需要可访问命名时保留语义关联并在共享组件层阻止默认激活，或使用 `aria-label`/`aria-labelledby`，不得通过全局 `pointer-events` 规则阻断控件自身操作。

## shadcn/ui 组件管理

- 涉及 `shadcn/ui` 项目初始化、组件搜索、添加、更新、修复、组合、样式、表单、overlay 或 preset 时，必须使用 `shadcn` skill。
- 先检查目标前端目录的 `components.json`、已安装组件、`package.json` 中的 `packageManager` 和现有组件实现，优先复用和组合已有组件；使用项目包管理器运行 shadcn CLI，并在新增或修改组件前查看对应 docs 与示例。
- 遵守项目实际 alias、`base`、icon library 和 Tailwind version；未经明确确认不得使用 `--overwrite` 覆盖本地组件。
