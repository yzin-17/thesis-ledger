# F01 旧镜像隔离回退演练

## 目标与边界

为补 F01 的相容旧镜像回退证据，本轮只在独立 Docker 网络、临时 PostgreSQL/Redis 和临时 DSA SQLite 中启动本机保留的上一版 Server/Worker/DSA 候选；当前目标栈、持久卷、策略和业务任务均不停止、不替换、不修改。真实 Provider 与 AI 不参与。

候选本机镜像 ID：

- Server / Worker：`sha256:82037ac5d35693827d679fc9d8b9341fc52cf13116f28a7095a38660b9a31f9b`
- DSA：`sha256:e4e1671e7bdfdb632d545cf8cc07501bfe5f4d574fd73ca97469f99d1ef18e57`

## 第一次演练

从当前目标 PostgreSQL 以 custom/no-owner 方式生成一致性 dump，大小 3,195,495 字节。第一次隔离恢复在应用启动前失败：临时数据库 owner 使用了新名字，dump 中的 default privileges 仍引用源 owner `thesis_ledger`，因此 `pg_restore` 报 owner role 不存在。

该失败属于演练夹具没有保持源 owner 身份，不是旧候选镜像或当前结构不兼容；临时资源由 trap 清理，未启动旧应用。

## 唯一修正复试

临时 PostgreSQL 改为与源库相同 owner `thesis_ledger` 后，恢复成功：

- 当前结构 head：`20260927090000_market_derived_series_snapshot`
- public 表：68
- 独立应用角色 `thesis_ledger_app` 对 Account SELECT：true

随后上一版三类应用均能在该**当前结构**上启动：

- 旧 DSA `/api/health` 返回 200；
- 旧 Server 完成 Nest 启动，容器内 `GET /api/v1/health` 返回 200；
- 旧 Backtest Worker 记录 `backtest.worker.ready`，concurrency=1。

这证明候选 Server/Worker/DSA 二进制至少能够读取当前数据库结构并进入健康/ready 状态，没有出现缺表、Prisma 结构错误、Nest 依赖缺失或 Worker 启动失败。

## 未通过的完整回退条件

演练为避免复制目标 DSA 用户状态，给旧 DSA 使用了新的 tmpfs SQLite。旧 Server 启动后的目录刷新因此发现：恢复的 Server PostgreSQL 中本地 Catalog generation 高于临时 DSA 的新任务 generation，并按既有安全规则拒绝倒退，日志为“本地目录 generation 高于 DSA 任务，拒绝倒退”。DSA V1 capabilities 自身返回 200。

随后宿主映射端口的黑盒 curl 出现 `Empty reply from server`；容器内健康检查仍为 200，但本轮没有继续到 Accounts 和独立 Market V3 smoke。按本任务“一次修正重试后仍有卡点即记录并跳过”的约束，不进行第三次演练，也不通过复制/重写 Catalog 状态绕过拒绝。

因此本轮只证明：
1. 当前数据库结构可由旧 Server/Worker 候选启动；
2. 旧 DSA 候选可启动并提供 V1；
3. Catalog 状态倒退会失败关闭。

尚未证明**状态保真的完整三仓回退**：需要在隔离环境恢复/复制与同一时间点数据库绑定的 DSA SQLite（或使用正式可验证的状态备份）后，重新验证 Server/Worker/DSA、V1/必要协议和旧数据读取。缺这一点，F01 继续保持开放。

## 清理

复试结束后临时容器和网络自动删除；当前目标 Server、Worker、DSA、PostgreSQL、Redis 再次只读核对均为 running / healthy。包含真实数据库内容的临时 dump以及可能包含运行密钥环境的 docker inspect 临时文件已删除；仅保留不含凭据的应用日志用于本地诊断。
