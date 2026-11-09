# 自然语言策略编写界面验收

对应 [Spec](../specs/2026-11-07-authoring-workflow-ui.md)。验收日期：2026-11-07。此次只调整 Desktop 展示，未提交、部署或发起真实模型调用。

## 结果与输入

- 编写页按「描述策略、确认条件、审阅保存」组织。应用结果后进入对应阶段；清空定义时保留修正入口。
- 模型选择、未知费用确认、问题与需求确认、交易条件、显式应用、审核修订、草稿恢复确认和原导航保护继续由原业务控制器负责。
- 新增阶段组件与模型选择组件；移除各阶段重复堆叠和定义卡片。调用记录区保留费用、用量、模型和应用状态。
- 输入文件的 SHA-256 与执行脚本保存在[验收产物目录](/Users/yzin/.codex/visualizations/2026/11/06/01a1b260-135f-7612-b408-d791809f56d9/authoring-workflow/source-hashes.json)。共享工作区原有修改保留，此记录不将全部差异归为本任务。

## 源码验证

| 验证 | 结果 |
| --- | --- |
| `pnpm exec vitest run test/authoring-draft-recovery.ui.test.tsx test/authoring-workflow.ui.test.tsx test/authoring-ui-contract.test.tsx test/authoring-local-workspace.test.tsx` | 4 文件、25 项通过；覆盖空草稿、显式应用、阶段迁移、修正入口、过期审核、菜单恢复及自动保存保护 |
| Desktop `pnpm test` | 256 文件、1635 项通过；复用此源码快照，无需重复运行 |
| Desktop `pnpm build` | TypeScript 与 Vite 通过；存在公共入口大于 500 kB 的分包提示 |
| 对本次 9 个源码文件和新增交互测试执行 `pnpm exec eslint` | 通过 |
| `pnpm node scripts/check-boundaries.mjs` | 通过 |
| `pnpm node scripts/check-file-size-guardrails.mjs` | 返回通过；6 个其他文件的存量尺寸警告，无有效基线，不能作为全仓 ratchet 已严格执行的证据。本次文件均低于阈值 |
| `git diff --check`（本次路径） | 通过 |

测试日志保留现有本地存储实验警告和 `authoring-local-workspace` 的 `act` 提示；测试无失败。

## 浏览器验收

使用技能自带 `shoot.mjs` 启动独立 Edge，通过同一浏览器的 CDP 驱动真实 React 页面；宽度为 1440、1024、820、768、390。逐一检查描述、需求、交易条件、定义预览及真实草稿，25 张截图均无页面横向溢出或表单、页签超宽。

- 受控服务只模拟接口结果：填描述并选择模型 → 分析 → 确认应用分析 → 回答问题、确认需求与交易条件 → 生成 → 确认应用生成 → 审核 → 勾选确认 → 保存并返回策略页。只发生显式触发的分析与生成两次受控提交，无真实 Provider 调用。
- 审核后修改名称，使旧审核失效；重新审核后才能保存。读取与丢弃菜单均经确认，取消不发送动作；五种宽度下菜单与确认框均位于视口内，实际鼠标点击后焦点进入确认框，Escape 关闭后回到「草稿操作」。页签支持方向键聚焦。
- 已有无效定义可展开编辑，清空文本后仍保留修正入口。
- 真实 Vite 页面读取现有草稿，CDP 拦截所有非 GET 请求；记录中全部为 GET。未修改草稿、身份、模型配置或业务数据。

截图：[描述阶段](/Users/yzin/.codex/visualizations/2026/11/06/01a1b260-135f-7612-b408-d791809f56d9/authoring-workflow/describe-1440.png)、[窄屏](/Users/yzin/.codex/visualizations/2026/11/06/01a1b260-135f-7612-b408-d791809f56d9/authoring-workflow/describe-390.png)、[审阅定义](/Users/yzin/.codex/visualizations/2026/11/06/01a1b260-135f-7612-b408-d791809f56d9/authoring-workflow/review-1440.png)。请求记录、其余截图与脚本位于同一目录。

## 设计技能检查器的适用范围

使用 [taste-skill](/Users/yzin/.codex/plugins/cache/taste-skill/taste-skill/2.5.0/skills/taste-skill/SKILL.md) 的 `consistency.mjs`、`assets/layout/check.mjs`、`perf.mjs`。页面沿用产品现有字体、黑白灰主题、页签和原子类，没有新设营销视觉系统。

`consistency.mjs` 返回 93 个失败标记，按规则逐组核对如下，不能报告为该工具全通过：

| 规则与数量 | 核对结论 |
| --- | --- |
| `no-visual` 3、`text-only` 2 | 将真实策略表单识别为缺少图片的营销段落；本页不需要宣传图片 |
| `hero-screen` 6、`section-height` 29、`one-heading` 2、`one-section` 5 | 要求首屏恰好一屏高、整屏段落与单一标题；与可滚动应用表单及多层导航不适配 |
| `container-edges` 32 | 将应用侧栏、根节点与主内容视为营销页容器；实际内容以主内容左边界对齐，宽表单有明确阅读宽度 |
| `off-grid` 12 | 目标位于共享侧栏的品牌、连接状态和图标文本；不属于本次表单。保留产品导航布局 |
| `fold-action` 1 | 将 390 宽度下的模型「请选择」识别为首屏营销主操作；表单可正常滚动，真实主操作通过交互验收 |
| `row-lines` 1 | 390 宽度共享底部导航为横向滚动容器，隐藏 38 px；是应用导航的既有滚动行为，本次表单和阶段页签无溢出 |

`assets/layout/check.mjs` 在首个宽度因缺少预期段落结构抛出 `r.sections is not iterable`，不能作为布局通过证据。实际尺寸、聚焦、操作与弹窗检查由上面的 CDP 验收承担。

`perf.mjs` 在 1440、390 下均因公共应用解析 JavaScript 约 1999 KiB 返回失败；总传输约 2157 KiB、CSS 约 145 KiB 为警告。主机繁忙，时序数值仅作相对观察；无失败请求，布局偏移中位数为 0。此任务没有修改全局分包策略，也不将这次界面验收扩大为全应用性能通过。

## 证据边界

完整写入链路使用受控样本；真实数据仅只读。此结果不代表真实模型语义质量、计费、Server 新部署、Docker、CI 或实际策略写入验收。

## 编写状态区下移

按用户截图反馈，将 `AuthoringDraftEditor.tsx` 中唯一的当前操作区移到阶段表单和操作按钮之后、历史记录之前；复用原组件及回调。修订与自动保存状态仍在顶部。运行、失败、取消、确认应用及费用展示沿用原有行为。

- 局部 ESLint 与 Desktop 构建通过，已有阶段流程与操作合同两份测试共 20 项通过。
- 使用最终构建页面和隔离受控 API，在 1440、1024、768、390 四种宽度验证操作区位于“分析描述”按钮下方，无横向溢出或区域越界。
- 浏览器点击取消后显示已取消；显式应用分析后切换到条件确认，当前操作区仍位于新阶段表单下方且仅出现一次；失败状态可见，无页面异常。仅两个隔离动作请求（取消、应用分析），没有模型调用或真实业务写入。
- 截图和脚本：`/tmp/authoring-operation-bottom/`；结果：`results.json`。首轮受控夹具缺少操作选择必填字段、取消动作错误要求修订号及即时断言未等待查询收敛，修正夹具后通过；生产接口与状态逻辑未改。
