# 交易标的选择验收记录

> 日期：2026-11-04
> 对应规格：[交易标的选择](../specs/2026-11-04-portfolio-trade-instrument-filter.md)
> 实施记录：[已归档任务](../archive/tasks/2026-11-04-portfolio-trade-instrument-filter.md)

## 结果与原因

AC1～AC5 在本次本地 API/Web 范围内通过。原接口按完整代码精确匹配，输入每个字符都会切换交易查询；加载时统计区被移除，筛选区随之移动。现改为下拉选择，统计区始终保留空间，未就绪时显示占位。

`GET /portfolio/trades/instruments` 按模式、可选账户读取全部历史交易的唯一代码，独立于交易分页、生命周期和当前标的。Ledger 复用 Market 的 `InstrumentDisplayService` 一次批量解析本地名称，目录未知或失败回退代码。公共契约校验范围、请求取消信号和缓存隔离；账户或模式变化同步恢复全部标的，生命周期保持原选择。

## 定向验证

| 检查 | 命令或输入 | 结果 |
| --- | --- | --- |
| Server | `pnpm --filter @thesis-ledger/server exec vitest run test/http-validation.test.ts test/ledger/trade-instrument-query.test.ts test/ledger/trade-query.service.test.ts` | 3 个文件、20 项通过 |
| API 客户端 | `pnpm --filter @thesis-ledger/api-client exec vitest run test/trade-instruments.test.ts` | 2 项通过 |
| Web | `pnpm --filter @thesis-ledger/desktop exec vitest run test/portfolio-trade-mode-scope.ui.test.tsx test/portfolio-account-filter.ui.test.tsx test/portfolio-trade.ui.test.tsx` | 3 个文件、18 项通过 |
| 构建 | Schema、API 客户端及 Desktop 包构建；维护脚本中的 Server 构建 | 通过；Desktop 仍有既有分包体积提示 |
| 静态检查 | 本次修改源码及相关测试 ESLint；`node scripts/check-boundaries.mjs` | 通过 |

Server 测试覆盖 101 个标的的完整返回、同代码不同市场、本地目录正确名称、未知和目录故障回退，以及账户模式不匹配。101 个标的是测试夹具，不是本地业务数据数量。客户端与界面测试覆盖精确参数、恢复全部、旧范围响应、选项失败后重试、分页和生命周期回归。

## 本地服务更新

在相邻 `thesis-ledger-infra` 使用维护入口 `./scripts/sync-code.sh thesis-ledger`。首次预检构建失败，尚未修改容器：Market 控制器出现只读字段赋值类型错误，HTTP 测试中的控制器构造参数也需同步。本次修正测试构造参数；重新读取 Market 控制器时，其不可变更新修复已由工作区其他改动提供，未覆盖该文件。

第二次脚本退出码为 0，Server 与 Backtest Worker 完成同步、重启和健康检查。日志为 `/tmp/trade-instrument-sync-final.log`。基础镜像仍为 `sha256:1654b11a1f4b39c94bfff670dec539b46e373af427cd8ea14c88da80a3622b45`。本次没有数据库结构、业务数据、volume 或 Provider 配置变更；可写层快更不代表镜像或安装包发布。

## 真实页面

本地 Web `http://localhost:5173/portfolio` 连接已同步的真实 API，使用当前业务数据验收。浏览器脚本 `/tmp/trade-instrument-filter-browser.mjs`，结果与截图在 `/tmp/trade-instrument-filter/`。

- 实际模式全部账户：13 笔交易，下拉包含“全部标的”及 4 个名称、代码选项。
- 选择 `161725.OF`：精确请求返回 5 笔交易，选项仍覆盖全部历史标的；恢复全部后返回 13 笔。
- 暂停该真实请求，加载前、加载中、完成后筛选框顶部均为 448.75 像素，高度均为 36 像素，统计区高度均为 20 像素。
- 切换 Android 基金账户：恢复全部标的，仅显示该账户 1 笔交易，下拉为全部和 `000001.OF`；没有向新账户发送原白酒基金代码。
- 选中基金后切换模拟模式：恢复全部标的，按模拟范围读取 3 个历史标的；新模式交易请求没有沿用原代码。
- 检查 1440、768、390 像素视口及窄屏下拉；浏览器没有运行错误。自动化最初把正在关闭的账户弹层也算作选项，改为读取当前打开的标的弹层后通过。

## 最终核对与边界

接口、服务、模块依赖方向及界面查询范围一致；复用原 Select、原子类和本地名称投影，保留现有账户名称、详情、分页与其他未提交工作。未新增传统样式、定时输入查询或远程名称读取。相关构建及运行结果满足本次完成条件；没有将原生编译、安装包或远程发布计入本次验收。
