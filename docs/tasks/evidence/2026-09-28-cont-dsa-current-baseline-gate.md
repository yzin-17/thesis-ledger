# DSA 当前基线门禁续验

日期：2026-09-28（Asia/Shanghai）。本叶状态：`skipped_after_retry`；官方 `offline-tests` **未运行**，不得更新目标运行态。

## 与旧失败的关系

[先前官方门禁](2026-09-28-cont-dsa-stable-gates.md)在旧隔离副本上得到 7208 passed / 16 failed / 1 skipped。当前工作树已有多处源码和测试变化，故旧失败不能直接视作当前源码失败或通过。本轮仅精确复核那 16 个 nodeid：普通工作树里分组定向运行全部通过；这不是单次官方全包。未主动使用真实 Provider 账号或发起业务来源请求，但普通工作树定向测试没有全局读取审计，不能宣称零账号读取。此前的官方失败记录原样保留。

## 新隔离副本

- 用 `rsync` 建立 `/private/tmp/cont-dsa-current-20260928/workspace`，排除真实 `.env*`（保留模板）、根 `data/`、`logs/`、`.venv/`、`.git/`、`node_modules/` 与缓存；误复制的前端 `node_modules` 仅从本叶临时副本删除。`src/data` 三个源码文件在副本中存在。
- 运行器使用 `env -i`、临时 HOME/XDG/TMPDIR/数据库/日志路径和合成 DSA 密钥；Python guard 拒绝外部 DNS、非本测试绑定连接、真实 `.env`/数据库及用户配置读取。仅对已审阅的 `docker/entrypoint.sh` 假工具场景和 `macos-signature-audit.sh` 假工具场景放行固定 shell 命令。`guard-check` 实际通过；该隔离仍不是 OS-wide 沙箱，不证明任意原生进程零外连。
- 副本复制后执行 `rsync -acn` 校验，受控源输入相对副本差异 **0**。没有修改三仓生产源码、真实数据库、Docker 容器或现存账号。

## 执行与阻塞

| 检查 | 结果 |
| --- | --- |
| 旧 16 个失败 nodeid，在新隔离副本定向合并运行 | **15 passed / 1 failed**；失败为 Volta 在临时 HOME 找不到 Node 默认版本。 |
| 同一失败项的一次定向环境修复重试 | 用现有 Node 24.18.0 二进制后，Volta 问题消除，但测试按副本的相邻目录寻找 `thesis-ledger/packages/schemas/dist/index.js`，该临时路径不存在；仍 **1 failed**。不再重试。 |
| 官方 `scripts/ci_gate.sh syntax` | 当前完整副本退出 0。 |
| 官方 `scripts/ci_gate.sh flake8` | 当前完整副本退出 0，critical 计数 0。 |
| 官方 `scripts/ci_gate.sh offline-tests` | **跳过，未执行**；旧失败点在隔离下仍未全部通过，且用户规定一次重试后记录并跳过。 |

独立普通工作树定向运行中，该 Tushare/Schemas 测试已通过，说明当前失败是临时副本缺相邻 Schemas 构建路径，不能把它记成业务源码回归。反过来，普通工作树通过也不能替代无凭据隔离、官方完整 `offline-tests` 或目标 Docker。低成本官方检查发生在定向预检之后，顺序偏差明示；没有声称严格验证 ladder 已闭合。

恢复时需在**新前提**下明确提供只读、与当前主仓输入一致的相邻 Schemas `dist`，并在完整隔离边界下重新验证 16 个定向点；再按官方顺序运行完整门禁。不得直接重跑本叶相同失败前提、绕过 DSA 低层失败或用目标容器健康代替当前源码已部署证据。
