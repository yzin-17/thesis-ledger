# 统一回测比例展示验收记录

对应[规格](../../specs/2026-11-07-backtest-ratio-consistency.md)和[任务](../tasks/2026-11-07-backtest-ratio-consistency.md)。

## 当前结论

列表、统一详情、基准和部分结果的百分比读取已统一；回撤图表轴与焦点使用共享 number 展示。定向 6 文件 / 76 项及 Desktop 完整 247 文件 / 1496 项通过，构建、lint、仓库门禁和四宽 28 组真实浏览器均通过。

## 原始反例

新增实际 DOM 测试起初未显式启用 jsdom；补齐后重新记录原始失败，/tmp/goal-backtest-ratio-before-dom.json：28 项中 4 通过、24 失败。普通与零已有行为通过，临界长小数、极小正负、最大有限和超大文本暴露原问题；新比例读取入口尚不存在的用例也计入原始失败。

图表使用实际组件和 Hook，仅替换轻量图表库的环境接口以捕获传入轴格式，7 项中 2 通过、5 失败，/tmp/goal-backtest-ratio-chart-before.json；出现 -1.00%、-0.00% 而不是 -1.01%、-1E-7%。最终全部通过。真实图表库另由浏览器验证。

## 读取与保留合同

比例原始文本不经浮点转换，状态解包与 amount 历史形状由策略详情模型持有。number 读取仍使用原路径，夏普、利润因子、金额和图形计算保持。最大回撤指标仅去除符号，图表继续保留回撤正负；未知值、零和不可用原因分别处理。

基准兼容性、指纹、费用门禁仍优先。有效超大文本使用同一比例有效性，避免误报策略或基准缺失，同时修复此类文本此前绕过兼容性覆盖的问题；部分结果对比例与其他数值分别判定。新增不兼容、未核验、费用不支持的有效 Schema 样本，确保限制仍生效。初版不兼容样本缺少不同字段，已改为实际 Schema 校验后使用。

实际组件测试检查列表、详情收益与幅度、非百分比 1.23、原原因及基准展示，并比较读取前后 JSON 不变。受控样本是组件读取投影，不宣称完整回测结果协议或引擎验收。

## 最终包级与门禁验证

| 检查 | 最终结果与原始证据 |
| --- | --- |
| 定向 | 6 文件 / 76 项，/tmp/goal-backtest-ratio-targeted-final2.json |
| Desktop 完整包 | 247 文件 / 1496 项，/tmp/goal-backtest-ratio-desktop-full.json |
| Desktop 构建 | 通过，/tmp/goal-backtest-ratio-desktop-build.log，既有 chunk 提示保留 |
| ESLint | 10 个源码/测试文件通过，/tmp/goal-backtest-ratio-lint.log |
| 格式 | 10 个适用文件通过；两个图表存量紧凑文件修改前后均未满足完整 Prettier，局部改动保持，/tmp/goal-backtest-ratio-format-scope.json |
| 边界与依赖 | 通过，8 包依赖图通过，/tmp/goal-backtest-ratio-boundaries.log、/tmp/goal-backtest-ratio-dependencies.log |
| 尺寸 | 6 个既有警告，ratchet 通过，/tmp/goal-backtest-ratio-sizes.log |
| 维护入口 | check-unified-backtest-ratio.cjs 经 Node --check 并执行最终矩阵 |

Domain/Server 的 2549 个共享输入与前轮最终输入相同，Mobile 272 个输入相同；按原范围复用前轮 Domain 614、Mobile 210 及相关构建。本轮不重复无关包验证，不宣称整个主工作区或目标 Docker 就绪。

## 最终真实浏览器

维护入口 apps/desktop/scripts/check-unified-backtest-ratio.cjs，复用既有 5173 服务。1440、1024、768、390 四宽、7 类值共 28 组；实际列表投影、结果 Tabs、轻量图表库与组件均使用源码。指标是边界文本样本，图形采用独立有限回撤序列，未将超大文本注入 number 图形计算。

每组检查收益和回撤幅度、其他指标与原因、基准净收益和差值；聚焦真实图表、上下键逐点和锁定、Escape 解除、五种范围操作、交易/数据/概览页签往返后重新锁定，并检查页面溢出。受控输入递归冻结。

/tmp/goal-backtest-ratio-browser/results.json：28 组通过，页面错误、业务请求和真实写入为 0。实际查看 390 宽极小与最大有限值截图，确认文本、图表轴/焦点非零、控件和边界。Playwright 已关闭；没有重启既有服务或启动新的服务。

## 最终一致性与关闭

1960 个 Desktop/共享输入在完整包、构建和浏览器前后完全一致，/tmp/goal-backtest-ratio-input-stability.json；逐项摘要为 /tmp/goal-backtest-ratio-desktop-inputs-{before,after-browser}.json，维护脚本另见 /tmp/goal-backtest-ratio-extra-inputs.json。

AC1～AC4 与 T1～T4 均核对完成，Task 归档，现行 Spec 保留。活动任务继续使用最新 Desktop 集成证据，Mobile 仍按前轮记录；目标运行态和来源缺口保持。全线程 Goal 继续处理剩余展示合同。
