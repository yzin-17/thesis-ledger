# F01 回退镜像保留与双库状态快照（2026-09-29）

## 当前候选与停止点

按 [旧镜像隔离演练](2026-09-28-cont-f01-rollback-rehearsal.md)的精确 ID 预检，本机已找不到旧 Server `sha256:82037ac5…`；命令在任何数据库备份或临时容器创建前失败。当前 Docker 只有新的 `thesis-ledger:dev` 与 `daily-stock-analysis:thesisledger-dev` 应用镜像。不能把新镜像冒称上一版，也不能从旧镜像名推断其制品仍可取回。

## 更新前保留接缝

相邻 infra 的 `scripts/update.sh` 在构建覆盖可变开发标签前调用 `retain-rollback-images.sh`，按 Compose 当前运行的 DSA、Server 与 Backtest Worker 容器读取实际镜像 ID。以完整 SHA-256 命名本地 `rollback-` 标签；已存在同 ID 可重复执行，不同 ID、镜像检查错误、标签写入失败或回读不一致均停止更新。Server 与 Worker 即使运行镜像不同也分别保留；没有运行容器的服务只记录跳过。

当前真实运行容器已执行这一保留入口并核对：

| 服务 | 实际镜像 ID 与保留标签 |
| --- | --- |
| DSA | `sha256:2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543`，`daily-stock-analysis:rollback-2e75542952ca40f69c5b96b7f6ec75a184e4ea0db6ba362874c4b7607d287543` |
| Server、Worker | `sha256:4e4df1a1e73bac5807210795ccb74d1851668134baeadc52ca08cde438d63f8e`，`thesis-ledger:rollback-4e4df1a1e73bac5807210795ccb74d1851668134baeadc52ca08cde438d63f8e` |

`retain-rollback-images.test.sh` 9 个模拟场景通过，覆盖选定服务、重复调用、标签冲突、无容器、Compose 查询失败、非法 ID、检查错误、标签失败及 Worker 不同镜像；Compose 查询失败会在构建前停止，不会误作无容器跳过。`bash -n`、infra `compose-contract.test.sh` 和 `git diff --check` 通过。没有运行 `update.sh`，没有构建或重启目标服务。标签只保留本地 Docker 镜像，不是长期可取回制品；当前磁盘余量约 2.9 GiB，本轮未另存大体积镜像归档。

## 状态保真备份预检

对仍健康运行的目标 DSA 执行 SQLite 在线 `backup` 到权限受限的临时文件，`PRAGMA integrity_check=ok`，大小 25,616,384 字节；另从目标 PostgreSQL 只读导出 custom/no-owner dump，大小 3,319,206 字节、SHA-256 为 `39bc58b9b268de3123b409c61f04fd14bb3495ce0572d315bfd06c52146c5358`。备份前、备份文件及备份后两侧目录 generation 均为 28；源数据库名/owner 明确为 `thesis_ledger`。临时副本与 dump 在脚本退出时清理，未输出凭据、账户或目录内容，未修改目标卷。

这只证明可取得目录 generation 一致的短暂备份；两库未在同一事务下冻结，其他业务表也没有跨库同点证明。没有恢复 PostgreSQL、启动旧镜像或读取旧账户/目录，也没有真实回退。2026-09-28 的旧镜像已不存在，F01 继续开放。下一次完整更新前需确认候选制品可取回，并以状态保真的双库快照在隔离环境完成旧 Server/Worker/DSA、旧数据和必要协议验证；本地标签不替代这一门禁。
