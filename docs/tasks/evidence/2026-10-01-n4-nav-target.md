# N4 NAV 目标运行态验收

关联：[N3/N4 归档任务](../../archive/tasks/2026-10-01-n3-nav-worker.md)。本记录只在实际验收通过后补充完成断言；本地检查和隔离数据库不替代目标业务。

## 目标与部署前事实

目标为 `thesis-ledger-dev`，数据库名和 owner 均为 `thesis_ledger`。部署前结构 head 为 `20260930100000_rebase_legacy_market_policy`，缺少 `NavBacktestPreparation`；目标 DSA 缺少现行 NAV 生产服务与规则模块。更新使用官方入口的 `all` 范围和显式保留数据升级：

```sh
DEV_DATABASE_MODE=upgrade DEV_DATABASE_CONFIRM=thesis-ledger-dev/thesis_ledger ./scripts/update.sh all
```

部署前 `Strategy` 共 10 条，按 ID 排序拼接的 MD5 为 `e4d42500f2c5dae0225e4acf08ede605`；`BacktestJob` 共 37 条，对应 MD5 为 `22d8f99d2504def0a64521c6f40af63a`。升级后、创建本次验收记录前复核相同数量和身份摘要。未使用开发清库或删除 volume。

源码静态结构为 25 个 migration、71 张 SQL 表（60 Prisma model、11 raw-owned），head 为 `20261001100000_nav_backtest_preparation`。该静态结果不能证明目标已更新。

目标 Policy 部署前为 revision 31，只配置 ETF/hithink 路线。efinance 已启用且无需凭证；NAV 路线与研究准入尚待显式建立，健康状态不能替代准入。保存 Policy 时保留已有路线。

## 本地检查

- Server 最终全包：245 文件通过、28 文件跳过，1987 项通过、103 项跳过；类型和 build 通过。
  - 升级对账修复后复验：246 文件通过、29 文件跳过，1990 项通过、106 项跳过；类型/build、定向 lint、边界和尺寸门禁通过。真实升级 PostgreSQL 7 项另行全部执行通过，未用跳过状态替代实测。全包日志 `/private/tmp/n4-nav-upgrade-server-full.log`。
- 真实隔离 PG/BullMQ：重复投递、取消竞争和三次重试上限共 3 项通过；同时 NAV 列表 1 项通过。最终日志 `/private/tmp/n3-nav-runtime-history-final.log`。这些来源仍为受控 fixture。
- API Client 最终全包 46 项通过；类型和 build 通过。
- Desktop 最终全包 523 项通过；包含 NAV 界面与错误状态共 5 项、共享界面合同 19 项；类型/build 与 scoped lint 通过。构建保留现有大 bundle 警告，未放宽阈值。日期控件使用项目共享 `DateInput`；普通基金规则日期显式覆盖预热，净值披露与申赎确认明确区分；结果补齐中文指标标签及暂停、限购和渠道差异限制说明。最终日志 `/private/tmp/n4-nav-desktop-final-full.log`、`/private/tmp/n4-nav-desktop-final-build.log`。
- NAV 摘要合同定向 11 项、最终 Schemas 全包 588 项及类型/build 通过；最终日志 `/private/tmp/n3-nav-schemas-final-full.log`。
- 显式研究准入入口 15 项通过，`py_compile` 和 flake8 通过；说明性证据文案改为中文后复验通过。第三方测试组件产生两条弃用警告。
- migration matrix、文件尺寸门禁、跨层边界、DSA Dockerfile 官方转换及 diff 检查通过。文件尺寸检查报告 10 项既有警告；本轮新增文件未提高阈值。

## 来源准入与研究边界

CLI 默认仅取证；`--apply` 先只读核对当前既有 DSA 数据库，再核验批次全部真实来源并只写一次准入。原文证据包使用 `0700/0600`，绑定 SHA-256、当前 adapter/source 修订和不超过 24 小时的期限。现有 scope 含批次外基金时拒绝覆盖。

本次选择 `161725.OF:domestic`、`110011.OF:qdii`、`118001.OF:qdii`。先保留 2026-09-08 至 15 日的短区间正例，再完成 2026-09-08 至 21 日、四期均线策略的三个最终案例；预热 4 条、尾部处理日 4 天。基金类别在实际操作时重新核验。普通基金 T+1 是显式研究假设；QDII 按已审计基金披露文件核验 T+1/T+2。日期为来源净值日期与 XSHG 工作日交集，不能证明历史暂停、限购或严格发布时间。

验收申赎模型明确配置申购/赎回费各 1%、确认 T+1、份额可卖 T+1、现金再投资 T+2。这是研究模型，不宣称真实销售渠道费率。期末申请保留待处理状态，不能强制清仓或补充期末净值。

## 实际验收记录

2026-10-01 首次官方更新在应用镜像构建前拉取 Rust 基础镜像时遇到网络 EOF，未开始数据库升级；已使用相同官方入口重试。首次日志与重试日志分别为 `/private/tmp/n4-nav-update-all.log`、`/private/tmp/n4-nav-update-all-retry.log`。

基础镜像下载完成后，第二次更新因沙箱不允许 Docker Buildx 写入 `~/.docker/buildx/activity` 而在镜像构建前退出；数据库升级仍未开始。获得所需执行权限后再次使用相同官方入口，实际应用镜像已进入构建，日志为 `/private/tmp/n4-nav-update-all-build.log`。

第三次更新完成两个应用镜像，但在保留数据的隔离演练中拒绝了旧数据校验，尚未执行源库升级。备份 `.database-upgrades/run.BSpyKk/backup.dump` 共 3,316,542 字节、权限 `0600`；Server/Worker 保持停止。根因是校验器无条件把当前 Policy 映射到历史归档，本次仅新增 NAV 表时不应使用该映射。已按本次待执行迁移选择映射，继续逐表逐旧列摘要核验；24 项定向、类型/lint 和 7 项实际 PostgreSQL 通过，新增回归明确构造当前 Policy 非空而归档为空，真实备份恢复后升级成功。见[升级规格](../../specs/2026-09-27-preserve-data-database-upgrade.md)和[归档升级任务](../../archive/tasks/2026-09-27-preserve-data-database-upgrade.md)。

更新期间，宿主机 CLI 的真实来源 dry-run 成功，仅取证没有 Store 写入。共同范围为 2026-09-02 至 2026-09-22，三个原文净值记录数分别为 2764、4410、3900，身份类型依次为“指数型-股票”“QDII-混合偏股”“QDII-普通股票”。证据 SHA-256 为 `c4e0ef1dcb50f508ce46c7f6d2da1480a5bdf652642f4c07e124cc1e543193d6`，目录/manifest 实际权限为 `0700/0600`；证据路径 `/private/tmp/n4-nav-admission-dryrun/nav-research-161725-258fdb8025054017b100ebf2ab566d4e/manifest.json`。它验证了当前来源可取得，不替代目标容器准入或业务闭环。

- [x] 官方同源更新完成，目标结构、Server/Worker/DSA 健康和版本一致。
- [x] 升级后数据数量与身份摘要保持一致。
- [x] 目标容器内批次真实原文取证与 4 小时准入登记完成，范围、摘要及有效期可复核。
- [x] 目标 Policy 保留原路线并增加唯一 NAV 精确路线，前后状态核验通过。
- [x] 三个真实基金的准备、持久化创建、幂等重复、目标 Worker 成功结果和经济事件通过。
- [x] 旧合同与缺少研究决策均明确拒绝。
- [x] 实际客户端从策略准备到结果、历史刷新与重开通过。

用户明确取消 Electron 验证。本次客户端验收使用同源 Desktop 浏览器运行面，连接实际目标 API，Electron 不作为完成门槛，也不记录为通过。

最终完整更新日志：`/private/tmp/n4-nav-update-all-final.log`。目标业务脚本为 `scripts/nav-target-acceptance.mjs`；成功记录分别保存于 `/private/tmp/n4-nav-target-161725-long.json`、`/private/tmp/n4-nav-target-110011-long.json`、`/private/tmp/n4-nav-target-118001-long.json`，失败不能记为业务通过。

2026-10-01 08:46 UTC 官方重试成功，最终日志 `/private/tmp/n4-nav-update-all-final.log`。目标 head 为 `20261001100000_nav_backtest_preparation`，`NavBacktestPreparation` 实际存在、public 表共 71 张。验收数据创建前，Strategy 仍为 10 条、摘要 `e4d42500f2c5dae0225e4acf08ede605`；BacktestJob 仍为 37 条、摘要 `22d8f99d2504def0a64521c6f40af63a`。三个应用容器均 healthy；`GET /api/v1/health` 返回 200/healthy，database、redis、dsa 依赖全部 healthy。Server/Worker 实际环境均为 `DSA_TIMEOUT_MS=120000`。

成功备份与演练位于 infra `.database-upgrades/run.eXosbN/`，备份 3,316,542 字节，SHA-256 `dca4186fefd6f70259dda2e172ec99047a97ebc40863ab70bbf0d953ff106a0c`；角色 `thesis_ledger_app`，源/目标 head、完整结构、角色权限及全部旧列数据保留均有实际演练断言。DSA 容器内 CLI 与服务模块 SHA-256 分别为 `d05b1586d284d5aab13c5987c54eab3cab466d6ef7c38e1e7d61d3364a0f7555` 和 `bd6f66fd8867efb201dc51659b282c7803d3ba6c4c5ca3825d3ef06b1ba7a924`，与宿主机当前源码一致。

## 准入、实际执行与最终复核

以容器用户 `dsa` 执行 `scripts/admit_nav_research.py --apply`，逐只核验身份、全部来源页与正式披露文件；最终原文记录数为 2764、4410、3900。证据位于 `/app/data/nav-admission-evidence/nav-research-161725-5d41e1b69972473bb5b03e99db47046b/manifest.json`，SHA-256 `068f29dc7a1cd30efc5e9644c8aa54610cec670927ee1ed5bf355f5a63bbaa9f`，目录与 manifest 实测权限分别为 `0700/0600`。共同准入范围为 2026-09-02 至 28 日，有效截止 `2026-10-01T13:22:33.940617+00:00`；期限届满后须重新实际取证，不能由本记录继续授予资格。

目标 Policy revision 31 → 32，状态 `applied`。原 ETF/qfq/hithink 路线保留；新增唯一 `data/CN/MUTUAL_FUND/FUND_NAV_HISTORY` 的 `efinance/eastmoney` 精确路线，实际 Effective 状态为 eligible。前后 JSON 位于 `/private/tmp/n4-nav-target-policy.json`。

实际准备暴露了两处边界：普通基金决策范围必须包含预热，不能直接套用运行开始日；日历固定 104 天展望会越过已核验 XSHG 制品末日，即使所需真实日期均存在。前者由客户端显式规则日期解决，后者只把搜索上限限制于来源实际采集日，保留预热、尾部净值、披露工作日与冻结可见性拒绝。DSA 三个定向文件 70 项通过，`py_compile`、flake8 通过；官方 `./scripts/sync-code.sh dsa` 成功。容器日历模块 SHA-256 `55bbdcfb59915c071bf7a9d1e2ff4b39abeb247faf213f807fcb46ce3aa8e0dc` 与源码相同，日志 `/private/tmp/n4-nav-calendar-source-tests-final.log`、`/private/tmp/n4-nav-calendar-sync-dsa.log`。

118001 初次 Run 的来源净值末尾零被内核规范化，字符串比较误拒绝同一十进制数值，三次自动重试后进入明确失败。定价核验改为精确 `DecimalValue.compareTo`，冻结原文及日期、可见时刻、Provider 修订、质量和新鲜度继续严格绑定，真实数值篡改仍拒绝。42 项定向及 Server 全包 1991 项通过、106 项跳过，类型/build、lint 与复杂度门禁通过；实际隔离基础设施证据独立保留。官方 `./scripts/sync-code.sh thesis-ledger` 成功，日志 `/private/tmp/n4-nav-decimal-server-final-full.log`、`/private/tmp/n4-nav-decimal-sync-app.log`。两次快更仅修改运行容器可写层，镜像 ID 保持不变；重建容器需从当前源码再次执行官方更新，不能把快更当作新镜像发布。

| 基金 | 实际 Run | 准备耗时 | 成交与费用 | 期末与完整度 | 结果校验和 |
| --- | --- | --- | --- | --- | --- |
| 161725.OF，国内/T+1 | `52af3a15-a114-4ff1-b997-0a6533630e8c` | 19.405 秒 | 申购、赎回各 1 笔；费用 0.06/0.05 CNY | 无待处理；`partial`，未平仓剩余份额保留 | `6446975b5a5b338e` |
| 110011.OF，QDII/T+1 | `cd2d2b7b-314c-42e0-9044-2e656322fac8` | 22.345 秒 | 申购、赎回各 1 笔；费用 0.41/0.40 CNY | 无待处理；`partial`，未平仓剩余份额保留 | `05ba89ea99d1872b` |
| 118001.OF，QDII/T+2 | `0cca819b-1c57-43fe-8f54-ba01006d9a32` | 23.926 秒 | 申购 1 笔，费用 0.17 CNY | 赎回 1 笔待处理；`unavailable`，不补充期末净值或结算 | `e0a6ec6408921692` |

三个最终 Run 均 `succeeded`、attempt 1，公开读取经现行 Schema 和重算 checksum 核验，保留实际 `efinance/eastmoney` 来源与 `strictPit=false`。每例重复创建保持同一 ID；旧创建合同 `contractVersion=2` 与缺失日期决策 `{}` 均实际 HTTP 400。运行成功仅表示冻结执行与结果提交成功，不能把上述部分完整度和不可用指标写成完整经济结果。

短区间 Run `f0db5745-a05d-458d-8a94-7b9c415466d2` 另保留 1 笔申购和 1 笔期末待处理申请，完整度 `unavailable`；证据 `/private/tmp/n4-nav-target-161725.json`。它不是三个最终较长案例的替代品。

## 浏览器业务验收

当前 Desktop 源码在浏览器连接目标 API：从真实策略库的“基金净值回测”进入，明确输入 9 月 8 至 21 日、10000 CNY、国内基金、含预热的 9 月 2 至 21 日规则范围和两份中文研究决策，确认费用 JSON 的实际预览，再准备、核对来源和冻结时间、创建运行。浏览器 Run `02c4e48a-b6ee-4082-84ea-44fd54146f2c` 已完成，展示两笔申赎、费用、可用日、账户权益及研究限制；点击历史、刷新、重开同一 Run 后结果保持可读。界面实际展示中文换手率、已平仓交易数和区间收益标签。

原失败的 118001 Run `3829a84b-1475-4984-be97-23b91da7117b` 在浏览器点击“重试 NAV 任务”，复用原冻结数据并再次投递领取，最终 `succeeded`、executionAttempt 5、Snapshot `91860e549c4c3626bc84b1f53aac482c713541be8f81a77f31cb2a6dc12fe80f`、checksum `3c8e6809057cd276`。人工重试先递增 attempt，再由 Worker 原子领取递增；没有改写旧 attempt 的结果。实际读取、Schema 和重算 checksum 通过，证据 `/private/tmp/n4-nav-target-retry.json`；历史刷新后重开仍显示已完成、第 5 次执行、期末赎回待处理和不可用完整度。

最终历史 HTTP 200，现行摘要列表包含全部 6 个 NAV 运行；三个最终案例、浏览器创建和重试案例逐一公开读取均 HTTP 200/succeeded。健康 API 200，database/redis/dsa 全部 healthy，五个目标容器 healthy；本次最终启动与执行日志未见缺表、入口模块缺失或 Nest 依赖错误。浏览器截图 `/private/tmp/n4-nav-browser-result.png`、`/private/tmp/n4-nav-browser-retry-result.png`、`/private/tmp/n4-nav-browser-history.png`。

N3/N4 全部当前验收完成。没有提交或发布；保留既有未提交工作。目标回滚需使用升级备份和官方入口的独立恢复流程，不能用普通容器重建恢复数据库；本次快更的可写层会随重建消失。
