# M31/P6 补全门禁与旧资产回归

关联：[P6 Task](../../archive/tasks/2026-10-07-p6-market-state-expansion.md)、[港美有界验收](2026-10-07-p6-hkus-target-acceptance.md)。用户在有界功能完成后要求“补全”，本记录追加工程全门禁、保留旧资产回归与开发镜像固化证据，不改原来源资格和发布范围。

## DSA 正式全量门禁

已通过。执行目录为 `daily-stock-analysis`，命令 `PATH=.venv/bin:$PATH bash scripts/ci_gate.sh all`，退出0。最后统计：8183 passed、626 subtests passed、1 skipped、4 deselected；语法、关键 flake8、确定性入口及离线全包均通过。日志为主仓忽略目录 `.recovery-artifacts/m31-2026-10-07/p6-completion-dsa-ci-gate-final.log`。

两类根因分别收敛：

- 旧普通行情测试沿用手工准入要求，与当前配置读取契约不符。更新旧记录仅作审计、不阻塞普通价格的断言；失效、撤销、未来/过期有效期和熔断的独立准入验证使用真正需要准入的现金事件库存。HiThink 股票凭证缺失仍阻止调用，当前凭证轮换与旧记录撤销分开；HiThink 事件及公告的撤销、晚到结果、修订/进度拒绝测试保留。RQData 只核对注册元信息及未配置账号/策略，不启用真实来源。
- `test_fetch_tushare_stock_list.py` 在收集阶段将无 `__spec__` 的 SDK 替身长期放入 `sys.modules`，导致全包后续34项误判真实 Tushare 依赖缺失；单独运行这些组原本通过。改用按文件导入、仅导入期间的模块替身和独立 `sys.path`，新增原模块/路径保持回归。生产 `find_spec` 和依赖拒绝没有放宽。

修改后的独立准入/当前凭证/事件相邻68项通过；股票列表与实际受污染的报价、精确日线、Control、事件和行情组100项通过。两个范围通过后才重跑正式全门禁；没有增加忽略或降低门禁。DSA `git diff --check` 通过，说明同步到 CHANGELOG。主仓边界与尺寸门禁退出0，仍有9个既有尺寸警示、ratchet通过。

## 旧资产资格与实际回归

找到原备份 `.recovery-artifacts/2026-10-03-current/`，其 Manifest 记录时间 `2026-10-03T10:18:09.802Z`、结构 head `20261001120000_require_explicit_strategy_contract`。这是旧样本的来源身份，不是当前开发库结构。

| 原备份 | 字节数 | 原 Manifest 与实际 SHA-256 一致 |
| --- | --- | --- |
| `postgres.dump` | 18700277 | `4bb6cebf4717dd801198e103c6511688ef2fd2c79d69e77a7857e0a993c9747d` |
| `backtest-snapshots.tar` | 14993408 | `d1e4c7bfd15af8e9875ce0e13cd9f2389b13deaf889dbded27d876d7f51e22e4` |

只读 `pg_restore --data-only --no-owner --no-privileges --table=BacktestJob -f -` 从该 dump 导出47条持久任务记录，没有执行SQL或恢复目标数据库。`scripts/old-snapshot-backup-bundle.py` 逐条对齐 dump 中结果/校验值/Snapshot与 tar Manifest，核对 Parquet 原字节大小、魔数和摘要；输出只读内存重放输入。

`scripts/old-snapshot-memory-replay.mjs` 在当前实际 Worker 中读取这些原字节，仅以内存 Blob 替代物理加载，复用生产 Snapshot Schema、产物检查、比较指纹、完整输入/PIT/执行证据验证和对应场内/NAV Runner。网络传输及文件写入被阻断，11条既有成功V3各执行两次，结果完全相同并匹配旧数据库持久校验值；网络0、文件写入0、数据库未恢复。

| 旧任务 | 原校验值保持 | 原完整性保持 | 类型 |
| --- | --- | --- | --- |
| `4a8694de-f8b4-4d47-b0db-5ec16b29666e` | `733135b633176f64` | complete | 场内 |
| `f0db5745-a05d-458d-8a94-7b9c415466d2` | `92f694dbabe2afbf` | unavailable | NAV |
| `52af3a15-a114-4ff1-b997-0a6533630e8c` | `6446975b5a5b338e` | partial | NAV |
| `cd2d2b7b-314c-42e0-9044-2e656322fac8` | `05ba89ea99d1872b` | partial | NAV |
| `02c4e48a-b6ee-4082-84ea-44fd54146f2c` | `466917da7b8c572b` | partial | NAV |
| `0cca819b-1c57-43fe-8f54-ba01006d9a32` | `e0a6ec6408921692` | unavailable | NAV |
| `3829a84b-1475-4984-be97-23b91da7117b` | `3c8e6809057cd276` | unavailable | NAV |
| `f66b82b3-ac55-4046-b8a2-2da33b823af4` | `4a11f72fb3b0ae7f` | complete | 场内 |
| `4a5b559c-58ad-46ad-a075-69e5690c24ed` | `01fec3349070ad49` | complete | 场内 |
| `8ea8a831-9b3c-4463-8352-b0b92730499d` | `cb560dbe65dbe802` | complete | 场内 |
| `e784e529-6d24-4df1-908c-5d5fba4c515c` | `f310629effbdb556` | complete | 场内 |

日志 `p6-old-snapshot-memory-replay.json` 保留每条 Snapshot及产物数量。没有重写旧校验值或用新建相似任务替代旧样本。

库存边界：当前工作区只保留10-03备份、10-06来源预研和10-07新开发目标输入；所查临时目录没有10-06完整备份。B4 `873ba8dd-40c3-4f9e-b1d5-b16192f697b0`（`a07303d0e7c0f3ce`）及旧partial `652ba051-a4c5-493d-81e6-2cdbe3c090f0`（`8c66f3f721f5e4d8`）不在10-03包内，已询问较新备份路径。11条已保留样本的回归已完成；上述缺失身份仍不能宣称已恢复或重验。

## 开发镜像固化检查点

执行目录为 `thesis-ledger-infra`，正式入口 `DEV_DATABASE_MODE=check PULL_SERVICE_IMAGES=false PULL_BASE_IMAGES=false ./scripts/update.sh all`，保留数据库和卷。此前快更是可写层，镜像固化必须独立证明。

第一次正式入口退出1：维护可回收构建缓存后，宿主18750 MiB＜20480 MiB，Docker24146 MiB≥18432 MiB；在拉取/应用构建前停止。14条已持久终态的结果/Manifest摘要与保护记录一致，五容器healthy，日志 `p6-completion-image-update.log`。

宿主空间随后回升到20781 MiB，按相同入口重验空间通过；BuildKit 在开始实际构建前因沙箱无法写入 `~/.docker/buildx/activity` 退出，日志 `p6-completion-image-update-final.log`。原因定位后对同一正式脚本申请工具权限，未改变门禁、数据库模式或更新目标。日志 `p6-completion-image-update-escalated.log` 记录实际 DSA 构建完成，新的 `daily-stock-analysis:thesisledger-dev` 为 `16ddf4039da6`。

随后 Server 构建前的默认空间门禁失败，正式脚本退出75：宿主12105 MiB，自动维护可回收构建缓存后13601 MiB＜20480 MiB；Docker由16792回升到22111 MiB≥18432 MiB。Server镜像未构建，目标应用未重建。独立只读确认运行中的DSA仍为`e6cf0d1d5a7d…`，Server/Worker仍为`fc4df9e94993…`，均healthy；14条已有终态的结果/Manifest摘要与开始前完全相同。新DSA镜像仅是已完成的构建产物，不表示当前目标已更新或整组固化已验收。

宿主后续只读df回升至17617 MiB，仍低于默认门槛；已请求用户释放约8 GiB构建余量或提供明确允许清理的目录。未删除工程、数据库、旧备份、用户应用缓存或活动更新下载，未降低空间门禁。当前G3阻塞于容量；全部脚本退出结果、运行镜像与目标状态分别保留，后续更新和验收需在容量满足后继续。

保持 M32/R02/S05/F01 原任务边界，不发布到远端、不执行异地恢复、不提交或推送。

## 镜像固化最终收口

用户随后要求由脚本先删减Docker内容以达到宿主20 GiB。infra已补齐受保护镜像整备、已完成构建产物保护与条件性Desktop空闲块回收，原门槛改为主动整备后的目标。真实流程见[infra目标验收](../../../../thesis-ledger-infra/docs/tasks/evidence/2026-10-07-docker-space-preparation.md)。正式`update.sh all`退出0：起步宿主25782 MiB；Server构建前不足，自动整备后实测22003 MiB继续。未清理宿主缓存、工程、数据库、业务卷或必要回退基线。

DSA已部署`sha256:18da63560fdf58978764a998adbded528ccce87a9f537a2e019423247ea12fc4`；Server/Worker已部署`sha256:d56b95284530a4d8b4f70cd3bb9aecce92d4d7849df5e5913ffe97d9753dc972`，五容器healthy。原六volume名称及14条已有持久终态结果/Manifest摘要保持。M31两现金快照、CN/HK/US和旧US配置六条现有快照，以及原备份11条旧V3，各两次新Worker重放保持原校验值、网络0；旧备份仍未恢复入当前库。

新镜像创建现金任务`a2274899-2d16-4a46-9b17-ad78c59c5f9a`，持久succeeded/attempt1/partial；checksum `5d1a7d83d42a4004`、Snapshot `0c06f2c585a46404ccc4de276cbf07dec059b1fd4d4e5c80c037819362429474`。实际Tencent原价/官方现金包读取、资格12400份、现金793.6元、最终权益102777.6独立复算及全部权益点匹配，两次网络0重放通过。Safari展示与实际下载一致，`diagnostics-v2.json`文件SHA为`6d751e301a370e7312935f7a1a03f79c74d08ccad6cbaacc96780bd213a737fa`，深度核对完整当前客户端映射/API/Snapshot/checksum通过。

G1正式DSA全量门禁和G3开发镜像固化已完成；G2的已保留11条旧样本回归完成，10-06指定旧身份仍待较新备份。不会把当前开发镜像更新计为F01异地恢复/正式发布验收。
