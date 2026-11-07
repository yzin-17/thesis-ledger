# 收益、组合与风险比例读数验证记录

对应[规格](../../specs/2026-11-07-financial-ratio-consumers.md)与[任务](../tasks/2026-11-07-financial-ratio-consumers.md)。

## 当前结论

七个消费者统一使用共享比例展示，目标合计溢出补充提示完成。最终 Desktop 244 文件 / 1448 项、构建、lint、仓库门禁及四宽 28 组实际组件验收通过。计算、请求、原始值和冻结消息均未修改。

## 反例与消费者范围

第一组 32 项回归有 3 通过、29 失败，/tmp/goal-financial-ratio-before.json；修正测试按钮定位后的实际组件 6 项全部失败，/tmp/goal-financial-ratio-ui-before-final.json。例子包括极小值归零、临界舍入、最大有限值溢出和风险旧事件回退。

| 消费者 | 统一展示与保留语义 |
| --- | --- |
| performance-display | 保留原带正号与正零规则，极小值保持非零；非有限值显示不可用 |
| performance-return-display | 时间/资金加权比例委托共享合同，快照、独立原因、读取错误与汇率语义保留 |
| PerformanceSections | 配置权重偏差复用共享合同，partial 与汇率阻断仍隐藏不可用权重，进度条边界不变 |
| PerformanceTargetEditor | 仅当前权重展示与无效合计提示调整，原输入、精度、容差、校验和保存禁用条件保留 |
| PerformanceTrendChart | 焦点详情的披露和可定价覆盖统一，图形、资产数值与键盘交互保留 |
| PortfolioOverview | 保留正负号和零值规则，摘要、持仓收益及仓位使用同一合同，排序、颜色及容器保留 |
| risk.format | 新 metadata 与存量 inputs 的比例语义均保持非零；非比例指标和 event.message 不变 |

其余回测、行情、模型竞赛入口继续按各自输入类型与小数位核对，未在本轮机械替换。尤其文本型比例需要先解决 Number 转换导致的丢失；历史冻结摘要也需要保留其边界。

## 真实截图补充发现

第一版 101 项定向、1447 项完整包及 28 组自动浏览器通过后，实际查看最大值弹窗发现目标合计仍显示 Infinity%。该无效合计原本已触发校验和禁用保存，只是展示不清晰。

新增实际弹窗反例失败，/tmp/goal-financial-ratio-total-before.json。最终仅对非有限合计显示“超出范围”，有限值原来的两位/六位边界反馈保持。补充浏览器断言不出现 Infinity/NaN，并要求该场景显示中文提示。第一版结果不替代最终输入验收。

## 最终包级与门禁验证

| 检查 | 结果与原始证据 |
| --- | --- |
| 初版相关定向 | 7 文件 / 101 项通过，/tmp/goal-financial-ratio-targeted.json |
| 最终合计与精度定向 | 3 文件 / 39 项通过，/tmp/goal-financial-ratio-targeted-final.json |
| Desktop 最终完整包 | 244 文件 / 1448 项通过，/tmp/goal-financial-ratio-desktop-final.json |
| Desktop 最终构建 | 通过，/tmp/goal-financial-ratio-build-final.log；既有主 chunk 体积提示保留 |
| ESLint | 原 11 文件及最终变化的输入、测试 2 文件通过，/tmp/goal-financial-ratio-lint.log、/tmp/goal-financial-ratio-lint-final.log |
| 格式与维护脚本 | 11 个适用文件通过，/tmp/goal-financial-ratio-prettier.log；维护 CJS 经 Node --check 并执行最终矩阵 |
| 边界与工作区 | 通过，8 个包依赖图通过，/tmp/goal-financial-ratio-boundaries-final.log、/tmp/goal-financial-ratio-dependencies-final.log |
| 尺寸 | 6 个既有警告未增长，ratchet 通过，/tmp/goal-financial-ratio-sizes-final.log |

PerformanceSections 与 PerformanceTargetEditor 在本轮修改前已有紧凑排版未满足完整 Prettier，原样保留无关排版；没有扩大格式通过结论。前后检查 /tmp/goal-financial-ratio-format-scope-final.json，其余原通过文件已消除本轮新增格式差异。最终合计分支沿用该文件局部风格，未增加 ignore 或关闭规则。

Domain 和 Mobile 产品输入未变，前轮 565 与 206 项及其构建按原范围复用；Mobile 269 个输入比较完全相同，/tmp/goal-financial-ratio-mobile-inputs.json。本轮无 Server 或原生配置变化，不重复相应完整包或原生编译。

## 最终真实浏览器

维护入口 apps/desktop/scripts/check-financial-ratio-consumers.cjs，复用既有 127.0.0.1:5173。1440、1024、768、390 四宽覆盖普通、临界舍入、极小正负、最小非零、最大有限与零，共 28 组。

每组检查实际收益指标、配置偏差单元格、组合与事件文本；聚焦走势图、左右键和 Escape；打开目标弹窗、当前权重、合计、边界与取消；操作持仓排序并检查页面与容器溢出。原消息始终为“冻结消息：1.00% · 历史保留”。首次排序定位使用了 title 作为可访问名称，修正为实际 title 定位后通过，不改产品控件。

最终 /tmp/goal-financial-ratio-browser-total-final/results.json：28 组通过，页面错误、业务请求、真实写入均为 0。实际查看 390 宽最大值弹窗与极小负值页面，确认合计中文提示、文本、弹窗边界与表格内部滚动。浏览器均已关闭，既有开发服务未重启。

## 最终一致性与关闭

1949 个 Desktop/共享输入在最终完整包、构建与浏览器前后完全相同，/tmp/goal-financial-ratio-final-inputs-before.json、/tmp/goal-financial-ratio-final-inputs-after.json；维护脚本摘要另存 /tmp/goal-financial-ratio-extra-inputs-final.json。没有以此前输入结果替代新增合计分支。

AC1～AC4 已核对，本 Task 无剩余实施义务，归档。本记录继续供活动任务复用最新 Desktop 集成证据；全线程 Goal 继续处理文本型和剩余消费者。
