# Server/Worker 与 DSA 目标运行态刷新

## 更新前状态与入口

只读检查发现 `backtest-worker` 容器已退出，exit 255；最后应用日志仅有此前的 `backtest.worker.ready`，不能从该退出码推定业务异常。Server、DSA、PostgreSQL、Redis 当时健康。当前 Server typecheck、build 分别退出 0；当前 DSA 源码的[官方完整隔离门禁](2026-09-28-cont-dsa-schemas-isolated-gate.md)已通过。目标 infra `.env` 处于默认保留数据检查模式，未打开数据丢失开关。

依项目要求选择相邻 infra 官方入口。首次 `./scripts/update.sh thesis-ledger` 在构建前两次失败，原因是当前沙箱拒绝 Docker Buildx 写入 `~/.docker/buildx/activity`；日志未出现源码编译或数据库结构失败，脚本保留原容器与卷。新前提使用 `/private/tmp/cont-dsa-schemas-gate-20260928/docker-config` 的空 Docker 配置、只读链接的 Buildx/Compose 插件及现有 Docker socket；没有复制 Docker 登录配置。只读 `docker info`、`docker buildx ls`、`docker compose version` 成功后，官方 `update.sh thesis-ledger` 成功：构建、默认保留数据结构检查、Server 与独立 Worker 健康检查均通过。

随后通过官方 `./scripts/update.sh dsa` 一次构建并更新 DSA。HiThink Key 从用户指定的 `~/.zshrc` 在进程内读取，只经子进程环境传入 Compose；包装器在写临时日志前替换密钥值，没有把真实值写入仓库或日志。DSA 健康检查通过。两个更新入口都没有直接手工 Compose build/up、清库或删除 volume。

## 更新后只读核对

| 服务 | 镜像 ID | 状态 |
| --- | --- | --- |
| Server | `sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b` | running / healthy |
| Backtest Worker | 同 Server 镜像 | running / healthy |
| DSA | `sha256:e4e1671e7bdfdb632d545cf8cc07501bfe5f4d574fd73ca97469f99d1ef18e57` | running / healthy |

DSA 容器中的来源别名 helper、Control、HiThink ETF 适配器三文件 SHA-256 与当前宿主源码逐一相同；目标 DSA `HITHINK_API_KEY` 存在且与 `~/.zshrc` 值一致，但值未输出。Server Provider API 报 `credentialConfigured=true`、`credentialSource=environment`；普通策略 API 仍列出 `159516.SZ` 的 draft 策略。DSA 精确 V3 能力目录对 `CN/ETF/DAILY_BAR/1d/qfq`、`hithink/fund-market-historical` 返回 **`not_admitted`**。

因此本叶只证明当前目标应用已更新、Worker 恢复、宿主凭据已进入 DSA 环境和精确来源仍失败关闭。ETF 成交量/成交额单位、复权价格基准和完整历史来源准入未解决；`G0-H-target`、`G-Deploy-159516`、`G-Run`、`G-UI-159516` 均不勾选。没有对 HiThink 发起新的目标容器读取或普通回测。
