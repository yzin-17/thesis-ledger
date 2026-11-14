# 标的选择器名称回显排查

日期：2026-11-10。范围：Desktop 与 Mobile 的共享标的选择器、调用方预填与已选状态，以及相关编辑、更正入口。本轮仅排查，未修改业务代码或数据。

## 结论

仍有同类遗漏。上轮完成的是策略编辑及其关联版本读取链路，其他消费者尚未全部统一名称传递与回显。

本轮扫描 Desktop 21 个文件中的 22 处调用、Mobile 20 个文件中的 20 处调用；包含共享组件内部组合，并非 42 个独立页面。扫描覆盖 `InstrumentSymbolField`、`InstrumentPicker`、`InstrumentCombobox` 和 `InstrumentSearchCombobox`。下列结论分别注明源码与浏览器证据，不将静态扫描等同于全部页面验收。

## 确认项

| 编号 | 入口 | 当前问题与触发条件 | 依据 |
| --- | --- | --- | --- |
| A1 | Desktop 基金定投计划编辑 | 已有计划以 `plan.symbol` 初始化，只向选择器传代码，没有传 `fundName`；字段在编辑时禁用，无法通过再次搜索获得名称 | [计划编辑](../../apps/desktop/src/features/account-data/AccountDataRecurringFundInvestments.tsx:280)、[选择器参数](../../apps/desktop/src/features/account-data/AccountDataRecurringFundInvestments.tsx:360)；源码确认 |
| A2 | Desktop 独立研究标的 | 调用方持有完整 `InstrumentLookup` 与名称，选择器仍只接收 `value.symbol`。已选对象在组件重新挂载时，说明文字有名称，输入框只有代码 | [研究选择器](../../apps/desktop/src/features/ai/ResearchInstrumentPicker.tsx:15)；受控浏览器复现 |
| A3 | 双端辅助编写的交易约束确认 | Desktop 以 `draft.instrument.symbol` 预填选择器，“已选”说明同样直接显示代码；Mobile 的“目录标的”摘要也直接显示该代码。持久化确认对象没有被接入当前目录名称投影 | [Desktop 确认](../../apps/desktop/src/features/strategy-authoring/AuthoringConfirmation.tsx:47)、[Mobile 确认](../../apps/mobile/src/features/strategy-authoring/AuthoringConfirmationFields.tsx:48)；源码确认 |
| A4 | Mobile 通用标的字段及期权标的 ETF | Mobile `InstrumentSymbolField` 没有名称输入契约，选择结果仅通过 `onChange(item.symbol)` 向外传递；`InstrumentPicker` 只在调用方传入 `displayName` 时显示名称。期权 ETF 调用方也仅存储 `item.symbol`。选中后反馈文字有名称，但字段仍为代码 | [通用字段](../../apps/mobile/src/features/market/InstrumentSymbolField.tsx:20)、[通用选择器](../../apps/mobile/src/features/market/InstrumentPicker.tsx:67)、[期权 ETF](../../apps/mobile/src/features/market-reference/MarketReferenceContractField.tsx:106)；源码确认 |
| A5 | Mobile 基金定投计划编辑 | 编辑已有计划时，表单保存 `plan.symbol`，摘要直接显示 `form.symbol`；选择器没有接入已有计划及其名称。因此已有标的的识别摘要仍只有代码 | [计划编辑](../../apps/mobile/src/features/recurring-plans/PlanEditor.tsx:25)、[基金摘要](../../apps/mobile/src/features/recurring-plans/PlanEditor.tsx:132)；源码确认 |
| A6 | Mobile 成交更正入口 | 已有成交分支绕过选择器，直接用 `<Copy>{form.symbol}</Copy>` 识别当前标的，没有消费目录名称。该入口与当前列表展示不一致 | [成交编辑](../../apps/mobile/src/features/executions/ExecutionEditor.tsx:103)；源码确认 |

## 浏览器复现边界

复现脚本：`/tmp/audit-instrument-display.cjs`。在现有 `http://localhost:5173` 的 Vite 环境动态加载实际 `ResearchInstrumentPicker`，挂载隔离组件实例，传入包含 `displayName: 招商银行` 与 `symbol: 600036.SH` 的已选对象；所有业务写请求均被阻断。

实际结果：输入框为 `600036.SH`；说明文字为“招商银行 · 600036.SH。本范围只使用公开资料。”。这证明 A2 的问题来自名称没有传入共享字段，不是目录缺失。没有调用远程 Provider，也没有保存研究或修改真实对象。

A1、A3–A6 根据实际调用参数、状态初始化和渲染分支确认，未声称完成对应真实页面或设备验收。

## 已检查的不同用途

- Desktop 持仓编辑与成交录入使用 `InstrumentCombobox`，已有持仓分支显示 `editing.asset.name`，本次选中分支显示 `selectedInstrument.displayName`；不能因其内部仍提交代码判定遗漏。
- 导入校正中的“标准代码”、原始协议输入和历史冻结 JSON 具有直接编辑或审阅代码的用途。本次未将所有 `symbol` 文本一概判成错误，也未改写冻结内容。
- 策略编辑上轮已接入 `instrumentDirectory` 和编辑会话名称状态；不能以该入口通过替代上述消费者的验收。

## 后续修复边界

应先补齐共享选择器对于“查询文字、业务代码、已选名称”的输入与输出契约，再逐个接入已有数据和派生入口。当前名称由服务端批量投影；客户端不为回显另发补名请求。各消费者需要验证首次加载、选中、重新挂载、页签切换、清空、取消与实际提交代码，仍需保持历史冻结语义。

本报告只记录已确认的问题及证据，不代表这些遗漏已经修复。
