# 策略摘要三位比例验证记录

对应[规格](../../specs/2026-11-07-strategy-summary-ratio.md)与[任务](../tasks/2026-11-07-strategy-summary-ratio.md)。

## 当前结论

三位模式与策略版本摘要已接入，既有两位、六位和 number 合同保持。Domain 62 文件 / 631 项、Desktop 248 文件 / 1504 项、Mobile 50 文件 / 210 项完整测试通过；Node 24 精度定向 4 文件 / 86 项通过。相关构建、lint、门禁和四宽 36 组真实版本页通过。

## 反例与消费者范围

共享三位回归 17 项原 8 通过、9 失败，/tmp/goal-summary-ratio-domain-before.json。摘要真实页面初版缺少 QueryClientProvider，补齐隔离上下文后重新记录原始输入：8 项中 5 通过、3 失败，/tmp/goal-summary-ratio-consumer-before-final.json。反例包括临界长小数错误舍入、极小仓位归零和巨大费用显示无穷；其他普通、目标仓位、千分位、零及缺失/非法行为原本通过。

最终三位模式使用千分位、最多三位；小到不能正常展示时保留科学计数非零，指数舍入复用已有六位科学尾数。2 的固定两位不分组、6 的最多六位分组保持。显示只影响投影，不改变传入文本或存储。

策略摘要的权益百分比、目标仓位、固定止损、固定止盈、佣金和滑点均接入。样本先通过实际 strategySchema，再检查摘要和实际 StrategyVersionPage 的 SSR 输出，原始 JSON 前后完全相同，冻结说明原文保持。缺失与非法状态和操作门禁沿用。

## 最终验证

| 检查 | 结果与原始证据 |
| --- | --- |
| Domain 完整包 | 62 文件 / 631 项，/tmp/goal-summary-ratio-domain-full.json |
| Desktop 完整包 | 248 文件 / 1504 项，/tmp/goal-summary-ratio-desktop-full.json |
| Mobile 完整包 | 50 文件 / 210 项，/tmp/goal-summary-ratio-mobile-full.json，显式 --dir test |
| 消费者定向 | 3 文件 / 14 项，/tmp/goal-summary-ratio-desktop-targeted.json |
| Node 24 精度定向 | 4 文件 / 86 项，/tmp/goal-summary-ratio-node24.json |
| 构建 | Domain、Server、Desktop、Mobile 通过，/tmp/goal-summary-ratio-domain-build-final.log、/tmp/goal-summary-ratio-{server,desktop,mobile}-build.log，Desktop 旧 chunk 提示保留 |
| ESLint 与格式 | 6 个 TS/TSX 文件通过，/tmp/goal-summary-ratio-lint.log；8 个本轮文件格式通过，/tmp/goal-summary-ratio-format-final.json |
| 仓库门禁 | 边界、8 包依赖与尺寸 ratchet 通过，6 个既有警告未增加，/tmp/goal-summary-ratio-{boundaries,dependencies,sizes}.log |
| 维护脚本 | check-strategy-summary-ratio.cjs 经 Node --check，并执行最终矩阵 |

Server 仅验证共享包类型构建，无 Server 产品变更，不扩大先前完整 Server 测试的输入结论。没有原生依赖或配置变化，不宣称 Native compile。

## 真实版本页

维护入口 apps/desktop/scripts/check-strategy-summary-ratio.cjs，复用既有 5173 服务。1440、1024、768、390 四宽覆盖普通、临界、极小、目标仓位、千分位、巨大费用、零费用、缺失和非法，共 36 组。QueryClient 只提供隔离且禁用请求的数据边界，实际页面、Schema 与共享比例使用源码。

每组检查六类比例或无效门禁、诊断 JSON 的费用原字符串及冻结说明、页签往返后 JSON 不变、版本下拉展开和 Escape、页面溢出。首次脚本按链接查找 Base UI 按钮，随后 Select 被 Field 的“版本”命名，按实际 DOM 角色和名称修正定位，并等待选项可见；未改产品控件。

/tmp/goal-summary-ratio-browser-final2/results.json：36 组通过，错误、业务请求和真实写入为 0。实际查看 390 宽极小、巨大费用和非法定义截图，确认文本换行、原始定义滚动区与操作门禁。浏览器已退出，没有重启既有服务或另起服务。

## 最终一致性与关闭

1964 个 Desktop/共享输入、272 个 Mobile 输入、2550 个 Server/共享输入，在 Desktop/Mobile 完整包、构建和浏览器前后无差异，/tmp/goal-summary-ratio-input-stability.json；逐项摘要为 /tmp/goal-summary-ratio-*-inputs-{before,after-browser}.json。Domain 完整包通过后源码未再变化；维护脚本最终摘要另见 /tmp/goal-summary-ratio-extra-inputs.json。

AC1～AC4、T1～T4 已逐项核对，无剩余实施义务；Task 归档，现行 Spec 保留。活动任务继续保留运行态缺口，完整集成按本记录输入复用。全线程 Goal 继续。

## 后续中文显示补验

截图发现存量非法定义提示包含 ratio，回退主周期直接显示 1d。本次局部修复仅把新校验提示改为“比例必须大于 0 且小于或等于 1”，回退主周期复用已有中文映射；验证规则、原始 JSON、冻结文字和操作门禁均保持。此次为可逆显示修复，沿用本页记录，不新增实施任务。

Schema 十进制语义定向 1 文件 / 4 项、Desktop 4 文件 / 16 项、Schemas 与 Desktop 构建、两文件 lint、边界和尺寸 ratchet 通过，/tmp/goal-summary-chinese-{schemas,desktop}.json、/tmp/goal-summary-chinese-{schemas-build,desktop-build,lint,boundaries,sizes}.log。依赖清单未变，原 8 包依赖图按原输入复用；未重复完整包，前文 1504/631/210 项仍对应原输入。

维护脚本补充实际中文提示、日线回显和诊断原始 1d 的断言，四宽 36 组全部通过，/tmp/goal-summary-chinese-browser/results.json；错误、业务请求和真实写入为 0。已查看 390 宽非法定义截图，中文提示及禁用入口正常。输入稳定及与完整包的差异清单见 /tmp/goal-summary-chinese-stability.json、/tmp/goal-summary-chinese-delta.json。
