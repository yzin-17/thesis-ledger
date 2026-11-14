# 证券业务选择流程验收

规格：[业务流程内选择证券与港美股票支持](../../specs/2026-11-10-instrument-selection-workflow.md)；任务：[实施记录](../tasks/2026-11-10-instrument-selection-workflow.md)。

## 完成范围

Desktop 市场数据只保留路由策略、数据源、规则监测，目录搜索、手动确认及同步表单不再进入生产页面。Mobile 设置菜单、导航注册和导航参数移除独立目录入口。后台目录、搜索、确认和维护 API 保持；原组件及其受控回归样本保留，不注册生产导航。自选、持仓和成交的业务选择器继续工作。

此前授权的香港和美国 STOCK 已支持持仓关联，原国内股票、ETF、场外基金保持。本次没有放开境外 ETF、指数或公募基金。资格判断由 Server Market 的同一函数用于搜索、确认及 requireConfirmed，避免只改变按钮而写入仍失败。

新增持仓代码合同及手工输入共用 `positionSymbolPattern`：接受完整港美股票代码及原国内代码，拒绝零港股代码、带指数前缀的美股、错误长度和市场。原数量、价格字符串不转浮点数。

新建目录关联或手工资产按 HK/HKD、US/USD、国内/CNY 设置市场与币种；新写持仓基线消费资产实际币种。已有资产币种、名称及冻结账本不重写。Desktop 新增持仓显示港元/股或美元/股，美国市场使用中文标签；Mobile 港美股票成本币种与快照提交一致，国内现有账户口径保持。成交币种仍由用户明确选择。

## 定向与包级检查

| 检查 | 结果与输入 |
| --- | --- |
| Server 定向 | `vitest run test/market/foreign-stock-association.test.ts test/market/instrument-confirmation-state.test.ts test/risk-market-contracts.test.ts test/ledger/position-baseline-mutations.test.ts`：4 文件、29 项通过。覆盖 HK/US 创建与 requireConfirmed、原生币种、旧资产保留、境外非股票拒绝、国内及持仓精度。日志 `/tmp/instrument-workflow-server-targeted.log`。 |
| Server Market、Ledger、Portfolio 回归 | `vitest run test/market test/ledger test/portfolio/services.test.ts test/instrument.service.test.ts test/risk-market-contracts.test.ts`：132 文件、1,296 项通过；12 文件、52 项环境条件测试跳过，不当作通过。日志 `/tmp/instrument-workflow-server-regression.log`。 |
| schemas | `pnpm test`：134 文件、1,514 项通过；新增代码与 HTML pattern 测试 14 项。日志 `/tmp/instrument-workflow-schemas-tests.log`。 |
| Desktop 全包 | `pnpm test`：294 文件、1,882 项通过，日志 `/tmp/instrument-workflow-desktop-tests.log`。之后新增成本单位及美国市场标签，受影响表单定向与四宽浏览器重验，其余按未变输入复用。 |
| Desktop 最终定向 | `vitest run test/account-data-write-recovery.ui.test.tsx test/market-data-provider-ui.test.tsx`：2 文件、29 项通过；港美成交选择自动确认、精度、提交、失败恢复及三个页签通过。日志 `/tmp/instrument-workflow-desktop-final-targeted.log`。 |
| Mobile 全包 | 最终 `pnpm test`：57 文件、245 项通过，含菜单移除、自选不确认、持仓选择和港美成本币种/精度用例。日志 `/tmp/instrument-workflow-mobile-tests-final.log`。 |
| 构建与类型 | schemas、api-client、Server build 通过；最终 Desktop build 含 TypeScript 检查通过，保留原有包体积警告；Mobile 最终 typecheck 通过。日志 `/tmp/instrument-workflow-{schemas,client,server}-build.log`、`/tmp/instrument-workflow-desktop-build-final.log`、`/tmp/instrument-workflow-mobile-typecheck-final.log`。未改原生工程、配置或依赖，不宣称 Native compile。 |
| 相关 ESLint | 修改源码及定向测试退出 0；Mobile 导航 import 解析 React Native 依赖的 Flow 文件时保留解析诊断，不修改依赖或关闭规则。其余新成本展示及类型检查通过。日志 `/tmp/instrument-workflow-eslint-final.log`、`/tmp/instrument-workflow-cost-eslint.log`。 |
| 边界、依赖、规模及差异 | 全部通过，规模保留 6 项存量警告。日志 `/tmp/instrument-workflow-{boundaries-final,dependencies,size-final}.log`，`git diff --check` 通过。 |

首次持仓测试发现新资产币种已正确，而基线载荷仍固定 CNY；修正为资产币种后定向和相关 Ledger 回归通过。没有通过舍入金额或改历史记录消除失败。

## 实际浏览器与受控业务写入

本机 Edge 与宿主 Vite `http://localhost:5173`，脚本 `/tmp/check-instrument-workflow.cjs`，结果 `/tmp/instrument-workflow-qa/results.json`，最终日志 `/tmp/instrument-workflow-browser-final.log`。

1440、1024、768、390 均通过。真实市场数据页面验证只有三个页签，无目录搜索框；旧 `section=catalog` 地址落到路由策略。随后使用既有 `browser-drawer-visibility.html` 真实表单样本，在每个宽度分别对 `00700.HK` 和 `AAPL.US` 执行：

1. 持仓表单内搜索、选择，自动调用确认；检查港元/股或美元/股，填写高精度数量和成本。
2. 拦截保存持仓 POST，核对完整代码、数量及成本原始字符串；503 后输入仍可编辑并保留原值。
3. 成交表单内搜索、选择，自动确认，明确选用 HKD/USD；核对买入载荷代码、数量、价格和币种；受控 503 后保留原始输入。

共 16 个业务样本。每种宽度 4 次受控确认、4 次受控写入失败；其他写请求全部禁止，真实业务写入 0，浏览器错误 0。页面无横向溢出，抽屉在视口内；390px 抽屉 16–390，其他宽度沿用既有 640px 抽屉。已查看桌面市场导航和手机港美持仓、成交截图，代码、币种、按钮和数字可读。

截图 `/tmp/instrument-workflow-qa/market-{1440,1024,768,390}.png` 及同目录 `position-<symbol>-<width>.png`、`execution-<symbol>-<width>.png`。市场页截图时部分配置仍在读取，不将导航验证扩大为外部行情来源可用性认证。

验收脚本初期分别遇到未等待懒加载页签、抽屉初始化焦点覆盖过快输入，以及定位到 DecimalInput 的隐藏提交字段；按真实显示生命周期及可见输入定位修正后通过。未为这些脚本问题改产品逻辑或降低断言。

## 本地目标运行态

正式入口 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/scripts/sync-code.sh thesis-ledger`，执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`，无额外影响行为的参数；兼容性预检通过，退出 0。Server、backtest-worker 健康，未执行 migration 或卷操作；日志 `/tmp/instrument-workflow-sync.log`。

两个目标的镜像 ID 保持 `sha256:818afb6662fc6103edd1f4a27ba741fbdb21c76e7152e6e084d5629bcf7e976e`。快更在可写层生效，不能作为镜像更新或生产发布证据，重建容器会恢复镜像代码。Desktop 浏览器由宿主 Vite 加载当前源码，Mobile 源码与测试已更新，未重新安装设备应用。

独立真实 GET `/api/market-data/instruments/search` 核对：

| 代码 | HTTP | 可关联 | 已确认 | 禁用原因 |
| --- | --- | --- | --- | --- |
| `00700.HK` | 200 | 是 | 否 | 无 |
| `AAPL.US` | 200 | 是 | 否 | 无 |
| `600036.SH` | 200 | 是 | 是 | 无 |

未执行真实确认、持仓或成交写入。新资产币种与事务路径由受控 Service 和 Ledger 测试证明，业务提交由受控浏览器证明；没有把只读目标检查宣称为真实成交或真实数据库写入闭环。

## 最终复核

AC1–AC5 在上述范围通过。独立目录入口移除，搜索与自动关联在业务流程中保留；港美支持限定股票，金额精度、旧资产及历史记录保持。当前规格替代独立目录 UI 合同，原后台接口兼容保留；无当前未完成事项，未新增 TODO，未提交或推送。共享工作区其他修改保持。
