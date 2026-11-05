# S05 旧 Reader 冻结截点与实际数据库证据

日期：2026-09-27。对应 `S05-legacy-clock`，依据 Spec §6、§9，AC09、AC12。本叶完成；S05 的实际重建证据和其他真实验收继续开放。

## 实施结果与调用范围

旧 `MarketBarReader` 在声明历史协议时不再将 `window.end` 作为 `asOf` 回退。冻结截点必须显式传入，行情窗口继续按市场时区裁剪；固定供应商快照必须使用 `complete`，不能通过交互验收接受未知状态或失败回退。

`market-history-mode.ts` 统一检查两种协议的实际观察、逐 Bar 时间与可用时间：无效时间、晚于冻结截点、空输入、未知/未完成状态均拒绝。固定研究允许来源修订和序列身份未知，并原样披露；严格 PIT 的已识别身份、来源修订与重建引用条件继续保留。历史价格可以早于研究取得时间，只要取得时间仍在显式研究冻结截点内；没有改写 `availableAt`、价格时间或抓取时间。

调用检查确认：旧 HTTP 查询没有接收 `history`；无协议的交互请求保持原合同。现有 V2 Snapshot 调用已显式传入 `dataAsOf`，没有历史协议时仍按既有规则拒绝，不补造重建依据。本叶验证实际旧 Reader 的内部读取路径，不宣称旧 HTTP 接口已开放固定研究或完成真实历史重建。V3 Reader 与前一轮预检独立保留。

旧 Reader 从 797 行减少到 795 行，历史校验文件从 73 行变为 79 行；新增边界测试 147 行。没有扩大既有 Reader 大文件职责、调整阈值或添加忽略项。

## 本地与实际 PostgreSQL

新增历史辅助校验 9 项、实际 Reader 边界 13 项及真实 PostgreSQL 2 项。辅助/边界/既有 review 定向 36 项通过；旧行情/缓存、V2 Snapshot、V3 Reader/冻结与前一轮预检组合 10 文件、127 项通过。独立 PostgreSQL 6 项与该组合不重叠，共 133 项；36 项已包含在 127 项中。

实际 Reader 的新增测试覆盖：

- 缺显式冻结截点、固定研究使用交互验收时在任何策略/来源读取前拒绝。
- 历史窗口使用之后的真实研究取得时间，截点等时可接受，返回原行情时间、availableAt、修订与观察。
- 首次远端、并发共享获取、内存、Redis 和事实端口每次独立校验当前调用者截点。
- 刷新得到未来观察或远端失败时保持拒绝，不悄悄使用旧缓存或降级交互结果；未知交易状态不补为完成。

独立 `postgres:17-alpine` 使用 tmpfs、随机 localhost 端口、专用 `market_cache_fixture` 及 `s05_fixture` owner。通过项目显式开发重建入口应用全部 19 份 migration、68 张表，核对 head=`20260927090000_market_derived_series_snapshot`，初始化并使用 `s05_app` 应用角色。

真实 Prisma/事实缓存/Reader 证明：较晚研究截点从 PostgreSQL 接受真实观察，随后较早截点在内存拒绝；另一组数据库持久化的逐 Bar 可用时间原样回读，晚于截点时拒绝，未访问远端。其余四项既有版本共存、来源隔离、legacy 与覆盖回归继续通过。每轮临时容器均按本轮标签确认后清理，目标业务库未访问。

首次 PostgreSQL 两个新增场景未命中缓存：日期窗口被规范化为日终，其边界晚于最后一根完整 Bar 的时间戳，现有事实覆盖判断要求重新获取。核对真实代码后，将本叶冻结截点场景改为实际已存时间边界，第一次重试 6 项通过；日期窗口问题独立登记 `S03-date-cache`，没有因此扩大覆盖、关闭原门禁或将原失败写成通过。

Server typecheck、build、定向 ESLint、模块边界、workspace 依赖及 diff check 通过。首次 lint 发现测试中移除 `asOf` 的未使用解构变量，改为显式删除后第一次重试通过。文件尺寸门禁仍有 13 项既有无基线警告，不代表已有大文件债务已完成治理。

## 目标运行代码

官方 `./scripts/sync-code.sh thesis-ledger` 完成兼容预检、构建、同步及重启。Server/Worker 均 healthy，镜像保持 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`。这是容器可写层同步，不能作为镜像发布证据。

两个容器分别执行实际 `MarketBarReader.read`，每端 11 个受控场景全部通过：显式截点、完整验收、研究观察与内存截点、未来观察、未来 Bar 可用时间、事实端口/Redis 截点、共享获取分别验收、刷新未来观察、刷新失败、未知 Bar 状态。目标探针的端口为受控实现，不连接目标数据库、不调用外部来源或模型；真实 PostgreSQL 证据由上面的隔离测试单独提供。

两份编译文件在两端均与本地 SHA-256 一致：

| 文件 | SHA-256 |
| --- | --- |
| `market-history-mode.js` | `a24a9360a76f9c1d9c47d93ef77cbf07dce523d5e6b3edd581f794c86eb1fa39` |
| `market-bar-reader.js` | `24473d3735b53df21958bef306919b1305240a6387afa5bbae080bbeefdf1785` |

## 可复现记录与剩余工作

探针：`/private/tmp/goal-s05-legacy-postgres-20260927.py`、`/private/tmp/goal-s05-legacy-target-20260927.py`。

日志：`/private/tmp/goal-s05-legacy-directed-20260927.log`、`/private/tmp/goal-s05-legacy-regression-20260927.log`、`/private/tmp/goal-s05-legacy-postgres-retry1-20260927.log`、`/private/tmp/goal-s05-legacy-lint-retry1-20260927.log`、`/private/tmp/goal-s05-legacy-postgres-lint-20260927.log`、`/private/tmp/goal-s05-legacy-typecheck-final-20260927.log`、`/private/tmp/goal-s05-legacy-build-20260927.log`、`/private/tmp/goal-s05-legacy-sync-20260927.log`、`/private/tmp/goal-s05-legacy-target-20260927.log`。

`S05-legacy-clock` 完成；`S05-reconstruction` 的实际证据合同/读取/内容绑定仍未实现。S03 新增日期窗口缓存缺口保持开放；I01、真实来源、冻结/Worker、浏览器/Electron 门禁独立保留，先前耗尽重试预算的卡点不机械重试。全目标 active，继续剩余工作。

后续更新：`S03-date-cache` 已修复并通过实际 PostgreSQL 和目标代码验证，见 [日期缓存证据](2026-09-27-s03-date-cache.md)。该更新不改变本轮原始失败记录；S03 父项、实际重建证据和其他真实门禁仍开放。
