# 投资组合累计盈亏图表验收记录

日期：2026-11-04。对应[现行规格](../specs/2026-11-04-portfolio-pnl-chart.md)和[归档任务](../archive/tasks/2026-11-04-portfolio-pnl-chart.md)。

## 实施范围

在原有未提交工作区增量实施，保留无关修改，未提交或推送。本次未修改数据库结构、依赖清单、Provider 配置或历史业务快照。

- Ledger 新增 `trade-realized-pnl-history.service.ts`：按账户、模式和经济时间批量累计已卖出交易净盈亏，复用现行成本完整性规则，避免逐时点查询。
- Performance 新增 `performance-pnl-series.service.ts` 与 `performance-pnl-projection.ts`：只读冻结收盘快照和 Ledger 事实，使用快照内汇率，返回空点及稳定原因码。历史组合缺冻结范围时保留未知。
- `performance-snapshot-inputs.ts`、`performance-snapshot.service.ts`：新快照冻结完整账户集合，包括没有现金流水的账户；正式修订保留相同集合。未追写旧快照，未主动触发新快照。
- 公共 Schema 新增 `performance-pnl.ts`，API 客户端增加 `getPnlSeries`，校验请求与响应的模式、账户、币种和区间。
- 桌面新增 `PortfolioPnlChart.tsx`、`PnlTrendChart.tsx`、`performance-pnl-model.ts`、`performance-pnl.queries.ts`；接入 Dashboard、组合刷新与账本变更失效。图表位于汇总和持仓之间，继承账户与模式。
- Ledger/Performance Module 接线同步，`scripts/check-boundaries.mjs` 固化 Ledger 不得反向依赖 Performance 的门禁。

## 确定性验证

以下命令从主仓执行，省略实际使用的 `rtk proxy` 前缀：

```sh
pnpm --filter @thesis-ledger/server exec vitest run test/performance-pnl-series.test.ts test/ledger/trade-realized-pnl-history.test.ts test/ledger/trade-realized-pnl.test.ts test/performance/services.test.ts test/performance/snapshot-reconciliation.test.ts test/performance-correctness.test.ts
pnpm --filter @thesis-ledger/server exec vitest run test/performance-pnl-series.test.ts test/ledger/trade-realized-pnl-history.test.ts
pnpm --filter @thesis-ledger/server exec vitest run test/performance/pnl-snapshot-scope.test.ts
env NODE_OPTIONS=--no-experimental-webstorage pnpm --filter @thesis-ledger/desktop exec vitest run test/performance-pnl-model.test.ts test/portfolio-pnl-chart.ui.test.tsx test/portfolio-account-filter.ui.test.tsx test/portfolio-query-demand.test.ts test/portfolio-table.test.tsx test/portfolio-closed-dashboard.test.tsx
pnpm --filter @thesis-ledger/schemas test
pnpm --filter @thesis-ledger/api-client test
pnpm --filter @thesis-ledger/schemas build
pnpm --filter @thesis-ledger/api-client build
pnpm --filter @thesis-ledger/server build
pnpm --filter @thesis-ledger/desktop build
pnpm exec node scripts/check-boundaries.mjs
```

- 服务端相关回归末次整组 57 项通过；补充上海时区年界后，新接口和 Ledger 的 10 项定向测试通过；另新增冻结范围 1 项通过。按有效覆盖累计 59 个不同测试，未为统计重复执行整组。
- 前端相关 6 文件 / 43 项通过，涵盖历史断点、当前金额、零值、单点、失败重试、区间切换和旧范围响应隔离。
- Schema 包 122 文件通过，1 文件跳过；1447 项通过、3 项跳过。API 客户端 32 文件 / 186 项通过。跳过项没有计入通过。
- Schema、API 客户端、Server、Desktop 构建与桌面类型检查通过。正式快更再次执行 Server 及依赖构建。保留既有大包体积提示。
- 新增源码及本次修改入口的定向 ESLint、模块边界、差异空白检查通过。

## 发现与修正

API 客户端测试首次把 URL 对象当作字符串断言，改为读取字符串后通过。前端失效接线首次误放到账户列表分支，定向测试立即发现未定义变量，移入具体账户循环后通过。ESLint 发现未知对象字符串化及多余断言，收紧金额类型并移除断言后通过。

精度复核确认组合 `roundMoney` 默认保留四位，不是两位；历史累计和分项复用该精度，提示明细最多显示四位，当前金额仍按页面货币格式展示。新增年界测试确认“年初至今”以上海时区为准。上述源码改变后执行第二次正式快更，第一次结果未冒充最终输入。

浏览器脚本最初在账户选择后的 React 更新前读取旧页面，增加等待当前账户回显后，完整流程通过。没有降低业务断言或用固定成功数据替代真实接口。

## 本地 Docker 更新

两次均从 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra` 执行：

```sh
./scripts/sync-code.sh thesis-ledger
```

使用默认脚本配置，无数据丢失、结构重建或门禁放宽参数。兼容性预检通过，退出码均为 0。目标为 `thesis-ledger` 和 `backtest-worker`，两者恢复健康；DSA 和其他 Docker 项目未在该更新目标内。

最终脚本输出确认 Server/Worker 镜像仍为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。本次是容器可写层快更，镜像没有更新，重建容器会回到镜像代码。临时日志为 `/tmp/portfolio-pnl-sync.log`、`/tmp/portfolio-pnl-sync-final.log`。

独立运行态检查：实际历史 API 返回 200；跨模式请求实际账户返回 404；非法 `range=1D` 返回 400；`range=YTD` 返回 200。目标服务和 Worker 健康，不以健康状态替代下面的产品检查。

## 实际数据与生产构建浏览器

临时运行生产静态预览 `pnpm --filter @thesis-ledger/desktop exec vite preview --host 127.0.0.1 --port 5181 --strictPort`，代理现有本地 API。验收后停止该预览。用户现有开发页继续使用自身运行入口。

实际 `/api/v1/performance/pnl-series` 查询：全部账户和 Android 基金账户各返回 8 个历史时点，全部 `value=null`、`reason=price_unavailable`。这些冻结快照缺行情，保留缺口，未回填零值、未倒推历史曲线。

生产静态包真实浏览器鼠标、键盘和触屏检查通过：

| 场景 | 实际结果 |
| --- | --- |
| 全部账户 | 当前点 −¥58.90，与上方累计卡片一致；1 个可用点，8 个历史时点留空并说明原因 |
| Android 基金账户 | 当前点 −¥29.45，历史请求携带对应账户编号 |
| iOS 基金账户 | 返回概览后当前点 −¥29.45，历史请求切换到 iOS 账户 |
| 区间 | 点击“近3月”发出 `range=3M` 请求，中文选择状态正确 |
| 交易页 | 切换账户时不挂载图表、不新增图表历史请求；返回概览读取当前账户 |
| 刷新 | 刷新组合同时重新读取当前范围历史，恢复全部后金额回到 −¥58.90 |
| 键盘 | 左方向键可查看历史空点及“行情数据不完整”；Escape 关闭提示 |
| 触屏 | 390 像素下点选当前点可查看当前估值详情 |
| 模式 | 切换模拟后请求为 `mode=shadow`、全部账户，不携带实际账户编号 |

完整浏览器流程退出码 0，运行异常列表为空。1440、768、390 像素截图已查看；生产页面设计检查为 0 个失败、3 个既有风格提示，分别是全站 PORTFOLIO 小标签、系统字体检测和既有小字号占比，本次没有扩展为全站重设计。

辅助产物：`/tmp/portfolio-pnl-browser/`、`/tmp/portfolio-pnl-production-inspect/`；执行脚本 `/tmp/portfolio-pnl-browser.mjs`。关键真实数据、操作结果和命令由本文保留，临时文件不是唯一验收依据。

## 最终一致性与证据边界

AC1 对应 Ledger 时点/成本完整性和未来成交测试；AC2 对应冻结金额、账户范围、历史汇率及零值测试，和只读真实 API；AC3 对应公共契约、客户端和账户/模式查询隔离；AC4 对应确定性多点/断点与真实单点、键盘/触屏；AC5 对应包构建、门禁、正式快更与真实 Web 联动。

结论：本次历史累计盈亏查询、桌面图表与本地运行态通过。当前真实数据只支持当前点，不宣称已有连续历史曲线；多点曲线由确定性测试证明。未主动生成新业务快照、未改写历史，未来计划任务实际产出不由本次证明。Electron、手机安装包、远程发布和新镜像未验收，未做提交或发布。
