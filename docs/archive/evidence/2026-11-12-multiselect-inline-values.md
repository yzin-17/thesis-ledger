# 通用多选框内回显排查与验收

日期：2026-11-12。对应[规格](../../specs/2026-11-12-multiselect-inline-values.md)与[已归档任务](../tasks/2026-11-12-multiselect-inline-values.md)。

## 完成范围

10 处入口迁入各端共享多选组件，另完善两处已有框内标签的模型选择器。选中值在输入框内回显，选择后清空搜索；已选值仍可搜索、取消，标签可直接移除，长名称自然换行。

| 平台 | 入口 | 结果与保留行为 |
| --- | --- | --- |
| Desktop | 提供方能力 `ProviderEditorSheet` | 共用静态选项多选；保留原能力值及未知值 |
| Desktop | 风险通知提供方 `RiskNotificationProviderPicker` | 保留原保存时机、错误、重试和缺失提供方提示 |
| Desktop | 资料监测来源 `RuleSourceMonitorSettings` | 保留来源代码、资料说明和任务配置状态 |
| Desktop | 自主竞技场 `ArenaLiveSetup` | 复用领域模型选择器，保留提供方和模型组合身份 |
| Desktop | 日频竞技场 `ArenaSetup` | 同上，保留已选顺序和原创建数据 |
| Mobile | AI 能力 `AiProviderFields` | 支持目录选择及手工值，保留原逗号存储格式 |
| Mobile | AI 模型列表 `AiProviderFields` | 支持目录选择及手工模型，保留原换行存储格式 |
| Mobile | 实验模型 `OptimizationModelFields` | 保留最多三个模型、费用说明、未知费用确认与逐模型推理配置 |
| Mobile | 自主竞技场 `ArenaLiveSetupScreen` | 复用领域选择器，保留提供方身份和原数组 |
| Mobile | 日频竞技场 `ArenaSetupScreen` | 同上 |
| Desktop | 已有 AI 模型列表 `AiProviderEditorFields` | 完善选择后清空、搜索已选值和明确的移除名称 |
| Desktop | 已有实验选模 `StrategyOptimizationModelSelector` | 同上，保留数量限制、费用及推理设置 |

## 排查保留项

| 场景 | 保留理由 |
| --- | --- |
| 标的多选 | 已在前一轮统一框内回显；继续使用目录检索与市场切换契约，见[原验收记录](2026-11-12-instrument-multiselect-consistency.md) |
| 导入记录、表格行批量勾选 | 选择的是待操作记录，需保留逐行上下文和批量操作关系 |
| 参数优化授权 | 含当前值、范围和明确授权，不是普通值集合输入 |
| 提供方独立权限声明 | 每项分别确认账户是否具备能力，需保留逐项声明 |
| 模型用途路由开关 | 每个模型配置独立执行策略，保留配置层级 |
| 图表图例、指标和均线开关 | 是即时图表操作，保留紧凑工具及即时反馈 |
| 单选入口 | 保留单选契约 |

## 组件与内容分组

Desktop 通用组件位于 `components/ui/multi-select.tsx`，组合既有 shadcn `ComboboxChips`；Mobile 通用组件位于 `components/MultiSelect.tsx`，复用 `MultiSelectField`。通用组件不读取业务接口、不自行保存，不依赖 feature；枚举标签、模型组合键、来源说明和保存策略仍由领域消费者负责。`scripts/check-boundaries.mjs` 增加两端通用组件不得反向依赖 feature 的检查。

两端竞技场分别使用 `ArenaModelSelector` 保留 `providerId` 与 `model`，同名模型不会合并；不可用的已选值继续回显且允许移除。Mobile 实验模型职责从存量大文件提取到 `OptimizationModelFields`。模型变化保留原未知费用确认重置规则。

按本轮更新的界面分组规则，相关 Mobile 表单、竞技场创建及详情、图表页签使用 `ContentSection`；普通分组不再叠加面板描边和内边距。原有 `Section` 默认行为保持，其他消费者可继续使用原变体。Desktop AI 模型价格、请求参数、执行设置及实验模型配置移除普通内容框线；输入、按钮、表格和图表语义边界保留。

## 测试与静态检查

以下验证以本轮相关源文件和消费者为输入，无依赖、原生工程或数据库变更。

| 检查 | 命令或范围 | 结果 |
| --- | --- | --- |
| Desktop 定向测试 | `pnpm --filter @thesis-ledger/desktop exec vitest run --dir test test/multi-select.ui.test.tsx test/ai-provider-ui.test.tsx test/risk-center-interaction.test.tsx test/market-provider-capabilities.test.tsx` | 4 个文件、54 项通过 |
| Mobile 消费侧测试 | `pnpm --filter @thesis-ledger/mobile exec vitest run --dir test/parity` | 51 个文件、194 项通过 |
| 类型检查 | 两端 package 的 `typecheck` | 均通过 |
| ESLint | 本轮通用组件及修改的领域消费者；最后补查三个 Desktop AI 配置分组文件 | 无错误、无警告 |
| 依赖边界 | `node scripts/check-boundaries.mjs` | 通过 |
| 文件尺寸 | `node scripts/check-file-size-guardrails.mjs` | 退出码 0；存在五处范围外存量警告，本次无有效基线输入，不将其作为全仓尺寸治理完成证据 |
| 空白检查 | `git diff --check` | 通过 |

新增测试验证未知已选值、中文标签、连续选择、搜索已选值并取消、禁用、数量限制、原始保存内容、手工模型、同名模型不同提供方、顺序、费用与推理配置。Mobile 既有凭据、离线、取消及版本冲突测试更新输入方式后均通过。

浏览器发现 Base UI 默认过滤在连续选择后切换搜索词时可能保留上一轮候选；改为依据当前输入显式过滤并关闭重复过滤，增加连续不同搜索词回归。未修改归档构建副本或扩大测试忽略范围；正式 Mobile 测试使用 `--dir test/parity`。

## 实际浏览器验收

使用 Playwright 与 Microsoft Edge，代表宽度为 1440、1024、768、390。保存、失败及恢复均使用受控样本或请求拦截，不写真实业务配置。

| 验收脚本或页面 | 结果 |
| --- | --- |
| `scripts/local-runtime/browser/instruments/multiselect-inline.regression.mjs`，Desktop 六组实际组件 | 24/24 通过；覆盖能力、风险通知、监测来源、竞技场模型及两个既有模型输入 |
| 同脚本，Mobile 三组实际 React Native 组件 | 12/12 通过；覆盖 AI 能力与模型、实验选模、竞技场模型 |
| `scripts/local-runtime/browser/instruments/instrument-multiselect-mobile.regression.mjs` | 两处实际创建页 × 四档宽度，共 8 组通过；包含清空、聚焦、已选搜索与移除、分组导入及市场重置 |
| `scripts/local-runtime/arena-live-browser.mjs` | Desktop 四档宽度通过；图表、图例、指标、时间区间、持仓成交、创建和返回等原交互保持 |
| `apps/desktop/scripts/check-rule-monitor-schedule.cjs` | 四档宽度通过；创建、冲突、来源保留、启停、幂等执行及导航保持；真实写入 0 |
| `scripts/local-runtime/arena-live-mobile-browser.mjs` | 四档宽度通过；实际图表文档、触摸点位、图例、指标和详情，无页面错误 |
| Desktop AI 请求参数展开 | 四档宽度通过；展开后普通内容无框线或额外内边距，无页面横向溢出 |

主验收脚本检查页面横向溢出、弹出选项视口边界、长标签、搜索与移除，以及页面错误。风险通知与监测来源使用首次保存返回 503、重试成功的受控请求，确认失败期间保留选择，重试负载保留原提供方或来源数组。模型样本核对提供方身份、选择上限、顺序和原始配置负载。

主脚本截图输出至 `/tmp/multiselect-inline-qa`，Desktop 竞技场回归输出至 `/tmp/arena-multiselect-final-qa`；这些是本地可再生成产物，不作为源码提交。浏览器入口与脚本保留在仓库以支持复验。

## 证据边界与最终核对

真实 Desktop `/arena/new` 仅作只读检查：提供方读取返回 200，但当前工作区没有可用的实时研究模型，页面显示对应空配置提示并隐藏空选择器。因此有可用模型的选择、身份与创建数据使用受控样本验证，没有真实建赛或模型调用证据。

Mobile 验证使用实际 React Native 组件的 Web 渲染，`nativeHost: false`；未修改原生依赖或工程配置，未执行原生编译或真机验收。类型检查、测试和浏览器证据分别保留，结论限于本轮客户端输入组件及声明的浏览器行为。

最终核对覆盖共享组件与消费者、相关创建和详情入口、未知旧值、原始保存契约、数量及费用规则、失败恢复和保留项。工作区既有改动未重置、暂存或提交；没有 Docker 更新、部署或真实外部来源调用。本任务按上述范围验收完成。
