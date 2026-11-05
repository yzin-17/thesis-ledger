# 研究工作台 V2 消费验收

核对日期：2026-10-19。对应 [T8](../2026-10-18-research-evidence-evolution.md)。本证据覆盖客户端、序列化响应交互与受影响接口回归。

## 实现与合同

现有 AiChat 列表、侧栏和完整阅读使用 T7 合同，读取绑定身份、保存模式和范围。历史 V1 使用明确入口，未知范围不归入当前模式；待核验正文保留，引用资格单独判断。

新表单支持独立标的、全组合、账户、持仓和策略版本。对象来自目录及实际选择接口，独立标的不调用资产确认。只读能力接口返回创建开放状态和身份允许范围，不改变服务端开关。

提交前保存规范输入、稳定标识及所见设置版本；找回、原样重试和取消沿用原输入。停止等待只中止传输，未知错误保留原身份。确认未创建任务的失败恢复编辑，设置版本变化要求重新确认。Query key 包含身份、模式、范围和任务标识；显式关闭旧数据占位，传递取消信号并忽略旧身份响应。草稿沿用现有关闭和全局模式转换保护。

报告展示推理、数值/单位、失效条件、置信依据、资料质量、未知项、模型及材料时钟。引用按实际任务和保存范围读取，发布时间、来源可用时间、抓取时间及净值日期分别显示；不补造费用或历史模式。复用现有 shadcn 组件和原子类。浏览器发现并修复选中标的后回显对象 JSON 的问题：输入受控，中文名称使用 itemToStringLabel，提交仍使用目录 ID。

主要入口位于 apps/desktop/src/features/ai/：ResearchSubmissionSheet、use-research-submission、research.queries、ResearchSavedReport、ResearchEvidenceRead、use-research-workbench。只读能力及类别扩展沿用 Research、共享 Schema 与 API client。

## 自动检查

| 范围与入口 | 结果 |
| --- | --- |
| Desktop 定向：research-form-v2.ui、research-submission-v2.ui、research-query-isolation.ui、research-reports-v2、ai-workbench-ui、ai-workbench、原 NewResearchSheet、research-account-mode.ui | 八文件 56 项通过；随后报告文件新增质量缺口断言，五项通过；未变化断言复用，当前合计 57 项。 |
| pnpm --filter @thesis-ledger/schemas test | 104 文件、1216 项通过，含类别/精确范围混用拒绝。 |
| pnpm --filter @thesis-ledger/api-client test | 13 文件、88 项通过，含只读能力严格响应、取消信号及返回对象类别核验。 |
| Server：test/ai/research-submission-v2.test.ts、test/ai/research-query.test.ts、test/research/submission.test.ts | 三文件、31 项通过。 |
| node scripts/test-ai-provider-postgres.mjs | 12 文件、92 项通过；34 项 migration，合成 V1 逐字段保留及旧解析器读取通过。隔离数据库 ai_provider_concurrency_fixture、owner fixture_owner，结束后清理。 |
| Desktop / Server typecheck；Desktop build | 全部通过；构建保留既有大 chunk 提示。Server 及依赖构建亦由正式 PostgreSQL 入口完成。 |
| 本叶源码/测试定向 ESLint；新客户端复杂度 20、函数 220 行约束 | 通过，零错误/警告。既有 T7 查询投影复杂度不纳入新增严格通过声明。 |
| check-boundaries.mjs、check-workspace-dependencies.mjs | 通过。 |
| check-file-size-guardrails.mjs | 退出 0；保留八项既有警告。无有效比较基线，不能替代跨版本 ratchet 证明。 |

规范样例 packages/schemas/fixtures/research-v2.samples.json 未修改，SHA-256：8b6f4357e7d357a94b21938e5578c4aa354574eab0638ee20eb0987c7dbd676c。

## 浏览器受控实测

入口 apps/desktop/test/browser-research-workbench.html，使用实际 AiChat、API client、Query、共享组件和全局模式上下文。专用地址为 127.0.0.1:5178；research-workbench-browser-data.ts 在内存处理业务请求，未知请求立即拒绝。序列化样例不证明后端材料资格、真实 Provider 或模型质量。结束后关闭临时标签页和服务。

| 场景 | 实际结果 |
| --- | --- |
| normal | 搜索目录、中文回显、主动提交后进入报告，一次提交/一个任务。展开引用可见原币价格、来源及独立时钟；完整阅读保留内容。历史入口保留待核验 V1 正文与未知范围。 |
| lost | 保存后模拟响应丢失，找回进入已有报告；submitAttempts=1、created=1、finds=1。 |
| hold | 准备时停止等待，找回确认未创建，原样重试成功；两次提交尝试、一次中止、一次找回、仅一个任务。没有将停止等待展示为任务已取消。 |
| queued | 排队任务取消后读取到终态，列表保留原任务；一个任务、一次取消。 |
| closed | 已有问题和全组合选择时按钮仍禁用，最终提交数和任务数均为零。 |
| registered | 仅显示独立标的与策略版本；应用全局开关切为实际模式后，仅展示保存的实际范围记录，无提交。 |

各场景未知请求计数为零。截图为本机临时产物 /tmp/thesis-ledger-research-workbench-v2.png；源码夹具可以复现。

## 保留的验收边界

未更新目标 API/Worker、数据库或镜像，V2 写入保持关闭；真实模型及来源启用限制不变。五个现有开发容器健康，业务库未用于制造测试数据。

G1 仍缺 DSA N3 等前置，序列化浏览器不能替代真实模块新闻到执行闭环。G2a/G2b 的目标保留升级/恢复、G3 的获准目标消费继续未勾选。本机浏览器不等同于 Electron、移动原生或全站视觉验收；R01 按原 Task 与 G3 保留。跨进程恢复由正式 PostgreSQL 测试提供；浏览器夹具整页重载会重置内存服务，不声称其证明服务端持久化。
