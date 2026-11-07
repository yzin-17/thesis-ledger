# 文本型比例的无损展示

## 问题与目标

净值回测指标与费率、模型竞赛观察、基金估算相对误差均收到十进制文本，却先转为 Number。极小非零值可能归零，临界长小数可能改变舍入结果；普通百分比转换还可能溢出。现有 number 展示合同应继续保持。

在 Domain 建立文本比例展示：只解析符号、有效数字及十进制指数，将百分比指数增加 2；普通值由原生 Intl 保留文本精度舍入，科学计数先将尾数规范到有效范围，再单独合并整数指数，避免按巨大指数展开字符串。复用原生能力，不使用不适用的浮点 round/multiply 工具函数。

## 验收标准

- AC1：文本、长小数、正负、前导零、零、极小与极大指数均正确；无效输入显示不可用。普通两位和费率最多六位分别保持，费率沿用千分位，科学计数进位正确，原 number 合同不变。
- AC2：实际 NavBacktestResult 指标和费率、NavBacktestModel 费率、arenaRatio/观察摘要、双端基金估算对比接入公共合同。非百分比指标、不可用原因、净值与冻结结果原文保持，不改变计算和原始数据。
- AC3：Mobile 基金对比提取为同特性独立组件，继续原 TanStack Query、范围键、错误与空状态；双端实际组件使用隔离缓存验证，无真实请求或写入。
- AC4：定向反例、相关完整包与构建、lint、边界和尺寸约束通过；四宽浏览器验证真实组件、文本、弹窗/表格及溢出，原生图表与 Native compile 不据此宣称完成。
- AC5：最终输入稳定，记录普通位数、未知数据和冻结语义保留理由；完成后归档 Task，继续剩余 number 型消费者。

## 所有权与写集

共享展示及解析归 ratio-percent，arena 消费同领域公共 helper；包入口显式导出。Desktop 改 NavBacktestResult、NavBacktestModel、FundDailyComparison，Mobile 改 MarketDetailScreen 并提取 DailyFundComparison。独立组件有明确基金估算读取职责，不引入跨应用源码依赖或共享杂物层。

不修改 Prisma、API 合同、费用计算、回测引擎、历史记录、原生依赖或构建配置。受控缓存和原生环境替身只提供数据边界，实际比例函数与业务组件均使用源码；自行启动的验收服务应关闭，既有开发服务保持。

## 选型依据

已核对当前 es-toolkit 的 round/multiply/divide 均基于 number，不满足文本精度要求。沿用文本单位和 Intl 组合，不引入新工具函数依赖。[ECMA-402 数值输入规范](https://tc39.es/ecma402/#sec-tointlmathematicalvalue)包含范围外数学值收敛规则；本地运行时实测 1e310 为无穷，临界文本保留更精确舍入。规范化尾数后由独立指数显示，避免依赖范围外直接格式化行为。

实施由[任务](../archive/tasks/2026-11-07-decimal-ratio-display.md)持有。
