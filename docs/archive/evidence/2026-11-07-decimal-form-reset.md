# 数值输入原生表单验证记录

对应[规格](../../specs/2026-11-07-decimal-form-reset.md)与[任务](../tasks/2026-11-07-decimal-form-reset.md)。

## 当前结论

共享输入的原生重置、取消和外置表单修复完成验收。Desktop 最终 1402 项、构建、适用门禁及四宽 24 组真实浏览器通过。

## 原始反例与真实浏览器补充

- 初始 13 项合同回归有 3 通过、10 失败，/tmp/goal-decimal-reset-before.json。失败覆盖普通/组合输入重置、焦点、最新默认值、边界原值和外置表单。
- 第一版布局同步已通过 35 项相关测试和 1402 项完整包，但真实点击取消重置仍清掉草稿。该版完整包只证明其原输入，不作为最终验收。
- Chromium 的实际重置事件记录显示：原生监听器及其微任务执行时 defaultPrevented 为 false，下一任务才为 true。见 /tmp/goal-decimal-reset-cancel-before.json；首次浏览器矩阵在 cancel 场景停止，/tmp/goal-decimal-reset-browser.log。
- 最终修复把重置信号放到下一任务，事件取消处理完成后才接收；布局阶段按当前提交的默认值恢复。定向真实点击确认取消保稿和事件内切换默认值通过；最终 4 文件 / 35 项定向通过，/tmp/goal-decimal-reset-targeted-cancel-final.json。

## 当前消费者核对

| 消费者 | 输入方式与处置 |
| --- | --- |
| PortfolioPositionFields | 当前数量、平均成本使用 defaultValue 与命名原值；原保存流程 form.reset() 后关闭。实际 PositionFields 受控浏览器覆盖。 |
| StrategyConfigurationFields | V2 仓位和成本由 value/onChange 控制；保留父组件值，未修改消费者。 |
| RiskRuleEditorSheet | 阈值受控，原始文本、提交和失败保稿协议保留；已有定向继续通过。 |
| PerformanceTargetEditor | 目标百分比受控，分组输入及单位转换保留；已有定向继续通过。 |
| AccountDataExecutionSheet | 数量、价格受控，原始事件与修正入口保持；随完整 Desktop 验证。 |

只读百分比和当前未被消费的旧 StrategyRiskExecutionFields 未改动；本轮问题属于共享输入的表单归属与原生事件同步，不调整金融计算或策略合同。

## 实现所有权

DecimalInput 继续分离原值和展示。命名隐藏输入补齐 form 归属，disabled 仍排除提交。重置事件不发出 onChange，保留焦点；受控值继续由父组件拥有。每次重置信号只消费一次，后续普通 defaultValue 更新不会主动重置草稿；卸载与归属变化时旧监听失效。

复用现有 Input、InputGroupInput 和原子样式，没有新增业务渲染分支、选择器或依赖。维护浏览器入口会在失败时保存具体场景、已有结果及截图，便于复查。

## 执行与验收边界

所有页面为隔离样本，不读取或写入真实业务数据。没有 Server、Mobile、数据库或原生配置变更，沿用这些模块各自已有证据范围；本轮不重复其完整包，也不提供新的目标部署结论。

## 最终包级与门禁验证

| 检查 | 结果与原始证据 |
| --- | --- |
| Desktop 最终完整包 | 241 文件 / 1402 项通过，/tmp/goal-decimal-reset-desktop-final.json |
| 构建 | 通过，/tmp/goal-decimal-reset-build-final.log；既有约 2.85 MB 主 chunk 提示保持 |
| ESLint | 3 个改动 TypeScript 文件通过，/tmp/goal-decimal-reset-lint-final.log |
| 格式与维护脚本 | 5 个文件格式通过，/tmp/goal-decimal-reset-prettier-final.log；维护脚本实际完成最终矩阵 |
| 依赖边界与工作区依赖 | 通过，8 个包依赖图通过，/tmp/goal-decimal-reset-boundaries-final.log、/tmp/goal-decimal-reset-dependencies-final.log |
| 尺寸 ratchet | 通过，6 个既有警告未增长，/tmp/goal-decimal-reset-sizes-final.log |

重置取消的浏览器缺陷导致源码从微任务改为下一任务，因此最终完整包和构建按变更输入重新执行；第一版通过不替代最终结果。

## 真实浏览器最终矩阵

维护入口 apps/desktop/scripts/check-decimal-form-reset.cjs，复用 127.0.0.1:5173。1440、1024、768、390 四宽分别覆盖普通、外置表单、取消、受控、最新默认值和真实 PositionFields，共 24 组通过。

每组均检查原始 FormData、实际编辑、点击原生重置按钮、再次编辑后原生方法重置、焦点保持、完整原值恢复及重置不触发新修改。外置表单覆盖大整数，取消场景使用极小非零默认值；真实持仓数量和平均成本保留其完整规范原值。没有横向溢出，实际查看 390 宽持仓与外置表单截图，文字、单位和操作边界正常。

结果 /tmp/goal-decimal-reset-browser-final/results.json，截图同目录；页面错误 0、业务请求 0、真实业务写入 0。

## 最终一致性复核

1939 个 Desktop/共享输入在最终完整包、构建与浏览器前后相同：/tmp/goal-decimal-reset-inputs-final-before.json、/tmp/goal-decimal-reset-inputs-final-after-full.json、/tmp/goal-decimal-reset-inputs-final-after-browser.json。维护脚本摘要另存 /tmp/goal-decimal-reset-extra-inputs.json。

AC1～AC4 已逐项复核。原值与展示分离、取消保稿、受控归属、外置表单、5 个消费者核对及四宽真实浏览器均有对应证据。本 Task 无剩余实施义务，归档；当前记录继续供活动任务复用最新 Desktop 集成证据，全线程优化 Goal 继续。

本轮 10 份改动文档的 211 个本地链接均存在，/tmp/goal-decimal-reset-doc-links.json；最终维护脚本摘要一致。

后续共享包级检查点由[双端比例记录](2026-11-07-ratio-percent-display.md#定向与完整包结果)承接；本记录保留原验收输入，随闭合任务归档。
