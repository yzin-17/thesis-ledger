# 组合快照与估值走势运行时证据

## 验收范围

对应快照任务 R1/R2/R3 与走势任务 T3.Q1/T4.I1/T4.I2。原 Spec 的全部验收标准继续有效；本次补齐存储竞争、受管执行、质量传播及鼠标/键盘消费。在线基金估算、真实正式校准和触屏验收继续开放。

## 隔离数据库

`node scripts/test-portfolio-valuation-postgres.mjs`：专用 `postgres:17-alpine` 临时容器、tmpfs、随机 localhost 端口；数据库 `portfolio_valuation_fixture`、owner `fixture_owner` 双重核对；执行当前全部 26 个 migration，head 为 `20261001120000_require_explicit_strategy_contract`。2026-10-04 13:49 的最终执行 1 文件、8 项通过，专用容器已清理。固定行情仅证明存储和领域语义。

| 断言 | 结果 |
| --- | --- |
| 四路并发 provision，三个 systemKey 唯一，保留启停/cron，禁止改名/删除 | 通过 |
| US 开市但仅 CN 持仓，不写运行历史/点位，并推进下次时间 | 通过 |
| CN 开市采样，重复 Scheduler 轮询不重复执行 | 通过 |
| 停用任务立即运行绕过周末，分钟唯一键，排除现金账户 | 通过 |
| 八路同幂等键只产生一条快照 | 通过 |
| 八路正式修订只产生 revision 2；晚到估算不能覆盖；详情保留修订链、日级只取当前修订 | 通过 |
| 缺价保留已知金额、覆盖率与 UNAVAILABLE，正式失败不产生修订 | 通过 |
| 组合保留 LOW_COVERAGE，排除现金/模拟/异币种点 | 通过 |

本次修复了组合分钟点将 LOW_COVERAGE 简化成 PARTIAL、日级点丢弃 UNAVAILABLE 的缺陷，使用 performance 领域质量 helper 汇总状态。

## 目标运行态

目标 API 为 `http://127.0.0.1:3000/api/v1`。使用 infra 官方入口 `./scripts/sync-code.sh thesis-ledger` 更新 Server 和 Backtest Worker；兼容预检通过，两容器重新健康，结构 head 未变。镜像 ID 保持 `sha256:f9738d362de75b1adf4de91160ac44c630a2243a27ea2054b268bc5a0db18811`；这是容器可写层更新，重建后消失，不构成镜像发布。

- 受管 ID 后缀 011/012/013 分别对应盘中采样、盘后估算、正式校准；均可见且不可删除。盘中临时停用和 cron 修改已恢复为原 `enabled=true`、`* * * * *`，再次 provision 保留配置。
- 盘中首次 run `ef5ec921-e5df-468b-8432-c2939036880c`，第二次 `da2f27f7-dcd7-49cc-93d6-98d0fc552890`；均成功、attempt 1、各采样两个账户。北京时间 13:53 的浏览器“立即运行”另生成 run `24fe63fd-503c-4a40-b579-1d77c2fcb71b`，trace `3601488a-2359-4bd1-8182-933d7e4dc8ce`，成功采样两账户。
- 盘后生成三个 2026-10-04 DAILY_CLOSE 估算槽位；组合快照 `5d6f7268-12a1-4734-9c64-b2d6225e6ee7`，revision 1，已知现金 844、已知成本 155、定价覆盖 0，状态 UNAVAILABLE。
- 正式校准手动执行和当日 06:30 的实际 Scheduler 执行均扫描 3 个槽位，正式化 0、待补齐 3；未制造正式结果。周末自动盘中不新增运行，nextRunAt 持续推进；开市正向门禁由隔离 Scheduler 覆盖。
- 更新后真实 HTTP：分钟组合为 LOW_COVERAGE，日级为 UNAVAILABLE，已知金额仍为 844。history 可读，summary 因缺价返回稳定 `PARTIAL_PORTFOLIO_SNAPSHOT`。

旧验收 Ledger 未被修改。运行前后 GET events 原始响应 SHA256 均一致：

| 账户 | SHA256 |
| --- | --- |
| `0e9677d2-98c6-45b1-8bc3-8d07b9209180` | `0fbaef556819de4ae6c2df4e6217fd20b8f71e22b54873899df74b69c6fbf6aa` |
| `93337db7-a5a0-40c5-823f-63577e9e924b` | `16adbe5ab0384cc5189c91118ccfbae03e2fcf3327fd64f0e4dc68a88bbaee2b` |

## 浏览器与应用检查

`http://127.0.0.1:5176/performance` 真实点位鼠标命中与键盘选择显示时间、844、估算、覆盖率 0/0 和低覆盖；日级显示数据不可用。自动化页可见三个系统任务、无删除入口，运行历史展示采样、快照及待补齐数量。

专用固定输入页 `/test/browser-performance-trend.html` 复用生产组件，覆盖稀疏跨日四点、2,000 个分钟点、单点与空数据。宽屏鼠标命中 08:00 的 1,100 点并显示披露 14%/定价 8%；键盘前后选择和 Escape 通过。兼容区间保留周线，不兼容区间回退分线。最终 Tooltip 锚点由选中 SVG 点变换到容器坐标，宽屏点中心与 Tooltip 中心均为 378.266px。390×844 下文档宽度 390，首/尾 Tooltip 均夹在视口内（边界 16～272px）；切换数据会清除旧激活。修复采用 SVG 原生坐标变换以及现有原子类组合。

截图保存于 `/tmp/portfolio-valuation-target.png`、`/tmp/portfolio-valuation-narrow.png`，属于本机补充证据，未进入 Git。浏览器视口已恢复。

- Server 全包：253 文件通过、38 文件跳过；2,074 项通过、161 项跳过。条件式数据库用例的跳过不计为通过；上面的独立 PostgreSQL 8 项另行执行。
- Desktop 全包基线：81 文件、546 项通过；typecheck/build 通过。最终 Tooltip 锚点调整后，相关 2 文件 18 项、typecheck/build 及宽屏/窄屏真实浏览器通过；全包基线不作为最终修改后的重复执行结果。
- 定向 ESLint、边界、工作区依赖、HEAD 尺寸 ratchet 及 `git diff --check` 通过；全工作区 lint 8 组、1,427 文件通过，存量复杂度警告保留。新增数据库 fixture 按初始化职责提取，未提高阈值。

## 未完成门禁

1. 当前没有准入的 Quote/NAV/基金披露输入；600519.SH、161725.OF 缺价。旧 000001.OF 样本误差仅属历史证据，不能证明现行在线来源。已请求来源名称/配置或证据位置，未启用取消或跳过的来源。
2. In-app Browser 不支持 `Input.dispatchTouchEvent`，Chrome 当前未连接。窄屏、鼠标、键盘不替代真实触屏；走势 T4/T5 保持开放。
3. 正式修订竞争在隔离库通过；目标有持仓正式校准仍待来源齐备。当前任务不归档、不宣称产品全部完成。
