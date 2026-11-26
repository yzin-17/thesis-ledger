# 策略编辑原生端与本轮真实模型验收

对应[规格](../specs/2026-11-13-strategy-definition-authoring.md)、[实施任务](../archive/tasks/2026-11-13-strategy-definition-authoring.md)及[先前实施证据](2026-11-16-strategy-definition-authoring.md)。本轮由用户明确要求补齐原生端和真实模型生成，并按实际结果更新状态。真实业务数据保持只读，不创建提交。

本页保留首次原生/模型验收事实。随后用户继续授权排查修复，两份原失败样例已用相同自然语言、原模型及路由重验通过，详见[模型修复重验](2026-11-16-strategy-authoring-model-repair.md)；当前任务状态以实施任务为准。下文首次失败及其调用边界保持原记录。

## 本轮真实模型结果

本轮未通过模型生成验收。复用真实 `lmstudio` 的只读配置，模型为 `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，本地无凭证、配置费率为零，既有 `native_schema` 模式及 `authoring-generation-v5` 用途保持原值。使用当前生成 Schema 3 合同、正式编写消息、SDK 适配器和正式语义校验；不保存真实 Provider、路由或资格。

正式入口在 infra 工作目录执行，PATH 仅补充本机 Docker CLI：

```sh
BACKTEST_PLAN_ENTRY=authoring BACKTEST_PLAN_CASES=fixed-stop,trailing-stop \
node scripts/infra.mjs locked --idle -- node \
  /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/scripts/local-runtime/run-backtest-trade-plan-acceptance.mjs \
  /Users/yzin/code/thesis-ledger-workspace/thesis-ledger/var/acceptance/strategy-editor-model-20261116
```

总计三次真实调用：一次当前用途资格检查、两次自然语言生成。自然语言没有提示字段名。原始消息、实际线上 JSON Schema、完整响应、资格记录和结果均保存在 `var/acceptance/strategy-editor-model-20261116/`；入口退出 1，测试耗时约 273 秒，不重试、不切换模式、不追加调用。

| 样例 | 实际结果 | 保存和执行 |
| --- | --- | --- |
| 固定首笔成交价下方 5% 保护，平仓后等待十根行情 | Provider 以 `length` 结束，正式 8192 token 输出上限内未完成 | 未形成可保存配置 |
| 盈利 10% 后跟随最高收盘价下方 5%，其余相同 | 返回 Schema 3，但省略 `tradePlan`；需求覆盖仍引用不存在的保护、追踪和冷却路径，触发 `AUTHORING_COVERAGE_INVALID` | 正式校验拒绝，没有保存、冻结或执行该结果 |

第二份输出不能人工补写计划后冒充模型直接生成通过。既有 v5 历史资格和本轮资格探针成功均不替代这两份实际语义样例。业务数据库和 Provider 写入为零，模型结果仅写入私有验收目录，隔离 PostgreSQL 已由原入口清理。G03、L04 继续开放，本轮记录将“尚未调用”更新为“实际调用未通过”。

## iPhone Air 原生交互

目标为指定 `23AB3E1A-4C30-462C-943C-B9CB5B894E96`、iOS 26.5 的 iPhone Air 模拟器。实际原生容器加载当前 JavaScript，使用生产 `StrategyEditorScreen`、字段组件、`MobileProviders`、原生导航、键盘和 AsyncStorage。只有业务 HTTP 接收端及存储命名空间受控；不使用浏览器或 RN Web 代替原生页面，不改用户连接和草稿。

测试工具位于 `scripts/local-runtime/strategy-editor-native/`，受控入口位于 `apps/mobile/test/native-strategy-definition-editor.tsx`。Metro 为独立回环 8083，业务接收端为回环 5193，不代理真实 API。样本沿用上一轮股票/ETF 往返验证的 ETF 定义，包含 MACD、上穿、ATR 保护、阶段减仓及长小数；本轮模型失败结果没有作为成功原生输入。

主要流程的第五次运行 `fifth.xcresult` 两项均通过：

- 字段键盘输入、信号来源展开/收起、返回取消后内容保留、可视/JSON 往返、本机保存后返回重开。
- 受控保存已经持久接收但响应 503 时保留待确认记录，读取并找回原保存成功；只产生一次 POST，不重复提交，实际提交定义只改变策略说明，其余规则和长小数保持。
- 损坏 JSON 阻止离开文字页；未完成对象允许进入表单，未知节点和 `0.000000000000000001` 在修复及文字往返后保留。

实际接收原文及请求计数位于 `var/acceptance/strategy-editor-native-20261116/http-receipt.json`。原生截图、界面树及测试结果在同目录的 `.xcresult`，不将测试工具编译冒充新的产品 Native compile。

## 原生发现的问题与修复

真实重开检查发现：本机草稿写入成功，但 `staleTime: Infinity` 的查询缓存仍保留第一次读取的空结果，返回再进入会显示旧定义。已在持久写入成功后同步更新对应草稿查询缓存。新增“保存本机草稿后重新进入编辑器”回归，实际重新挂载消费同一查询；本文件五项定向测试通过。修复后的 Air 重开断言通过。

工具过程失败单独保留：Metro 首次未正确使用隔离端口、状态端点及工作区入口，随后补齐 pnpm Babel runtime 解析；原生工具最初定位到同名字段标题而非输入框，并在键盘区域执行滚动，均修正后重新验证。第三轮曾明确复现产品草稿缓存故障，不把它改记成工具问题。回归夹具最初重复返回同一 `Response`，第二次读取报已消费；改为每次请求返回新响应后通过。

独立计划检查 `plan-final.xcresult` 通过：原生键盘把“卖出数量比例”修改为 `0.250000000000000002`，JSON 保留全部小数及 `remainingQuantity` 数量基数，费用精度不变。截图、界面树分别导出至 `flow-attachments/`、`plan-attachments/`。`cleanup.xcresult` 通过，清除的仅为本轮命名空间草稿。

## Android 原生交互

使用既有 `Medium_Phone_API_37.0` 的只读副本、独立端口 5560 和 ADB 5042，不保存快照，不修改原 AVD 数据。安装现有 debug APK，实际原生容器加载与 Air 相同的当前生产编辑器 JavaScript；这不是本轮重新构建产品原生包的证据。

维护入口为 `scripts/local-runtime/strategy-definition-android.py`，最终结果为 `var/acceptance/strategy-editor-native-20261116/android-final/result.json`，`passed: true`，含 11 个键盘或业务界面取证节点。实际通过键盘输入、信号来源展开/收起、脏内容返回取消、JSON 往返、本机草稿返回重开、保存响应失败后找回版本、阶段比例长小数、非法 JSON 保留、不完整对象保留未知节点并继续修复。截图和界面树与结果同目录。

Android 接收原文单独保存在 `android/http-receipt.json`。两平台分别仅一次 POST、各新增一个受控版本；对比原版本，唯一提交差异是本轮策略说明，全部其他定义字段深度相同。阶段比例编辑在随后独立交互中验证，没有混入此前保存回执。

工具失败保留：最初硬件渲染的无窗口模拟器出现系统无响应、安装及界面抓取超时，改为软件渲染只读副本后恢复。首次脚本未等待本机保存完成即返回，触发正常的“正在提交”保护；补齐完成等待后重新执行。第二次开始时上次保护对话框仍在，需要明确关闭，再完成整个流程。未放宽保存、重开、精度或请求次数断言。

## 验证与收尾

Mobile 类型检查、相关文件 lint、导入边界、文件规模及差异空白检查通过；草稿缓存回归所在文件五例通过。Air 的主要两例、独立计划一例及清理一例通过，Android 最终完整流程通过。原生测试入口首次误加载内置业务页面的普通读取不计入受控验收，未主动提交真实业务数据；正式验收全部提交指向回环接收端。

收尾已核对：Air 清除本轮命名空间、移除专用 UI 测试 runner，保留用户应用并恢复为原来的 `Shutdown`；Android 只读副本退出且未保存快照，独立 ADB 服务停止。独立 Metro、受控 HTTP 接收端均停止，8083、5193、5042 无监听；原 AVD、真实连接和原有草稿保持。收尾再次执行 Mobile 类型检查及相关 lint，均退出 0。

原生两端完成后，T07、T08 的编辑器设备验收可勾选；T08 所列 AC09 只覆盖其当前定义纵向回读边界，完整真实模型义务仍由 G03、L04 持有。真实模型两项实际失败保留，整体任务仍未完成。测试产物留存私有验收目录，不把工具编译、当前 debug 容器或原生交互提升为发布包、CI 或真实模型生成成功。
