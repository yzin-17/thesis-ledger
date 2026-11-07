# 文本型比例展示验收记录

对应[规格](../../specs/2026-11-07-decimal-ratio-display.md)与[任务](../tasks/2026-11-07-decimal-ratio-display.md)。

## 当前结论

共享文本比例保留原始有效数字和独立指数，实际净值回测、模型费用、竞赛观察及双端基金估算对比已接入。最终 Domain 61 文件 / 614 项、Desktop 245 文件 / 1459 项、Mobile 50 文件 / 210 项完整测试与相关构建通过。最终四宽 32 组实际组件验收通过，页面错误、业务请求和真实写入均为 0。

## 反例与展示合同

原始文本测试 38 项中 1 通过、37 失败；竞赛 7 项中 1 通过、6 失败，Desktop 实际组件 10 项中 2 通过、8 失败。覆盖临界长小数、正负极小非零、超大整数、百万级指数、进位、未知值与既有 number 合同。

普通比例两位，费率最多六位并保留千分位。最后复核额外发现费率 10 应继续显示 1,000%；Domain 与实际模型组件各新增一项失败回归后修复，/tmp/goal-decimal-ratio-group-domain-before.json、/tmp/goal-decimal-ratio-group-desktop-before.json。最终共享定向 3 文件 / 69 项通过，/tmp/goal-decimal-ratio-domain-group-final.json。

文本原值不经过 Number；先规范化尾数，再通过 Intl 舍入并合并 BigInt 指数，不按巨大指数展开字符串。仅有限范围的展示结果用于归零判断。Number API 委托同一展示实现，输入值、计算精度和历史冻结文字保持。

## 消费者与查询范围

| 消费者 | 本轮修复与保留合同 |
| --- | --- |
| NavBacktestResult | 文本收益指标与费率无损展示；非百分比指标原文、不可用原因和冻结说明保留 |
| NavBacktestModel | 费率六位和千分位保留，原始 JSON、确认操作与费用计算不变 |
| arenaRatio / 观察摘要 | 使用公共文本比例，未知值继续“资料不足”；冻结输入不修改 |
| Desktop FundDailyComparison | 覆盖比例与相对绝对误差接入共享函数；净值及带符号绝对误差沿用各自合同 |
| Mobile DailyFundComparison | 从原页面按基金估算读取职责提取；相同 Query 键、queryFn、retry 和状态表达，覆盖及相对误差统一 |

Mobile 查询 token 对比仅有 retry:false 后的格式化尾逗号，忽略尾逗号后完全相同，/tmp/goal-decimal-ratio-mobile-query-contract.json。原紧凑 MarketDetailScreen 未作整文件格式化。模型样本通过实际执行模型 Schema，基金行通过实际 fundDailyErrorSchema；NavBacktestResult 样本仅为受控读取投影，不宣称完整结果协议或引擎验收。费用模型 JSON 使用应用内相同快照，摘要相同见 /tmp/goal-decimal-ratio-model-fixture.json，消除最初测试跨包相对导入，不放宽边界。

## 最终包级与门禁验证

| 检查 | 结果与原始证据 |
| --- | --- |
| Domain 完整包 | 61 文件 / 614 项，/tmp/goal-decimal-ratio-domain-full-compat.json |
| Desktop 完整包 | 245 文件 / 1459 项，/tmp/goal-decimal-ratio-desktop-full-compat.json |
| Mobile 完整包 | 50 文件 / 210 项，显式 --dir test，/tmp/goal-decimal-ratio-mobile-full-compat.json |
| 实际组件定向 | Desktop 11 项、Mobile 4 项，/tmp/goal-decimal-ratio-desktop-target-compat.json、/tmp/goal-decimal-ratio-mobile-target-compat.json |
| Node 24 原生运行时 | Domain 定向 69 项，/tmp/goal-decimal-ratio-node24-compat.json；首个调用误用不存在的 config，改为包目录执行后通过 |
| 构建 | Domain、Server、Desktop、Mobile 均通过，/tmp/goal-decimal-ratio-*-build-compat.log；Desktop 既有 chunk 提示保留 |
| ESLint | 本轮 16 文件命令退出 0，无自有文件错误，/tmp/goal-decimal-ratio-lint-compat.log；React Native 第三方 Flow 解析诊断保留，不宣称第三方源码已 lint |
| 格式与脚本 | 20 个适用文件格式通过，/tmp/goal-decimal-ratio-format-final.json；CJS 与 QA 配置 Node --check 通过 |
| 仓库门禁 | 边界、8 包依赖、尺寸 ratchet 通过，6 个旧警告未增加，/tmp/goal-decimal-ratio-{boundaries,dependencies,sizes}-compat.log |

本轮没有 Server 产品源码变化，仅因共享包变化验证 Server 构建；不据此覆盖此前 Server 全量测试输入。没有原生依赖或配置变化，未将 Web 组件与 build 计为 Native compile。

## 最终浏览器与输入

维护入口 apps/desktop/scripts/check-decimal-ratio-display.cjs，在独立 5181 QA 服务运行。1440、1024、768、390 四宽覆盖普通、千分位、临界舍入、极小正负、巨大值、空及失败，共 32 组；每组实际访问 Desktop 与 Mobile 两页。验证实际指标、费用、冻结原文、不可用原因、模型确认和 JSON 不变、两端空/失败与重读入口、无 Infinity/NaN、容器溢出。

最终 /tmp/goal-decimal-ratio-browser-final/results.json：32 组通过，错误、请求及真实写入均为 0。已实际查看 390 宽千分位、巨大值 Desktop 与极小值 Mobile 截图；文本换行和边界正常。确认仅更新隔离内存状态，重读按钮只检查存在，未触发请求。Playwright 已退出，自行启动的 5181 服务已关闭；既有 5173 服务未重启。

1955 个 Desktop/共享输入、272 个 Mobile 输入、2549 个 Server/共享输入，从最终完整包、构建到最终浏览器前后无差异，/tmp/goal-decimal-ratio-input-stability-final.json；逐文件摘要位于 /tmp/goal-decimal-ratio-final2-*-inputs-{before,after-browser}.json。维护脚本、QA 配置及额外数据摘要见 /tmp/goal-decimal-ratio-extra-inputs-final.json。

## 最终一致性与接续

AC1～AC5 已逐项核对。T1 文本与 number 合同、T2 真实消费者、T3 分层验证、T4 输入和文档复核均完成；Task 归档，现行 Spec 保留。后续继续处理回测列表、统一详情和图表的两位比例；策略版本三位摘要及非百分比绝对误差保持各自合同，另行界定后处理。活动任务继续保留运行态和来源资格缺口，本记录不替代。
