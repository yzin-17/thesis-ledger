# 买单有效期短输出目标运行环境验收

2026-11-19，经单独授权完成正式镜像更新。day、two-bars 均在目标 Server 的正式编写服务完成确认、保存和数据库重读；目标 Server 与 Worker 各自两次读取原快照，完整回放结果一致。普通修改保持 v5。[源码及隔离 API 验收](2026-11-19-strategy-authoring-order-validity-entry.md) · [Task](../archive/tasks/2026-11-15-backtest-trade-plans.md)

## 快更预检

在相邻 `thesis-ledger-infra` 执行：

```sh
rtk proxy env npm_config_registry=https://registry.npmmirror.com ./scripts/sync-code.sh thesis-ledger
```

退出码为 1。应用兼容检查首先比对工作区 `apps/server/package.json` 和目标 `/app/package.json`。两个目标的完整清单与工作区逐字段比较，唯一差异是工作区新增运行依赖 `yaml@2.9.0`。当前生成提示模块直接导入该包。快更只替换编译产物，运行依赖须通过镜像更新。主仓现场为 `1ed41878`，Git 默认状态有 806 条变更。预检前后两个容器的 ID、镜像 ID、启动时间及 healthy 状态逐字一致。用户随后授权以 `DEV_DATABASE_MODE=check` 运行正式镜像更新。

## 更新前的 v5 对照

在两个既有容器中只读导入正式 `authoringOperationSchema`、`generationOutput` 与用途合同。用 day 和 two-bars 的原修订，逐一检查入场、退出、风险、仓位、成本、交易计划及委托计划七个范围。每个容器共 14 个投影，均为带 `intentCheck`、`proposal` 的完整 v5 包装，均拒绝短响应。委托计划范围还逐份解包了两份合格的历史 v5 原始响应。七范围投影为构造对照，只有委托计划使用与此范围匹配的真实完整输出。只读 readiness 返回修改用途 `authoring-modification-v5`、`native_schema`、`ready` 和已有资格 `passed`。

两容器均缺少 `authoring-order-validity.js`，范围 Schema 均拒绝 `entryOrderValidity`。已核对原短回执、历史完整定义、隔离保存定义及原快照的关联，day 和 two-bars 的预期结果校验值分别为 `633620e5cabf5339` 和 `0b74741371f64882`。这些结果来自已完成的隔离验收。更新后的独立验证见下文。

本次私有回执在 `var/acceptance/order-validity-target-20261119-ynqrEw/`，包括 `sync.log`、`before.txt`、`after-preflight.txt`、`preflight-v5.json` 和 `readiness-before.json`。本轮真实模型请求为零，未重跑 ATR、提交或推送。

## 镜像更新与打包修复

在相邻 infra 运行 `DEV_DATABASE_MODE=check ./scripts/update.sh thesis-ledger`。首次构建及入口自带的一次重试均在 Server 生产依赖打包时返回 `ERR_PNPM_UNUSED_PATCH`。pnpm 12.21.0 报告的三个未使用补丁分别属于 Expo Modules Core、Expo Modules JSI 和 React Native。当时 Target 仍运行健康旧容器。

仅在 Server Dockerfile 的 `pnpm deploy --prod --legacy` 命令上设置 `PNPM_CONFIG_ALLOW_UNUSED_PATCHES=true`。这允许裁剪后的生产依赖集合缺少移动端补丁的目标包。工作区补丁、锁文件、完整冻结安装与补丁实际应用失败的检查保留原值。[pnpm 补丁配置说明](https://pnpm.io/cli/patch#allowunusedpatches)

宿主临时目录离线打包确认三项未使用补丁已变为警告，因本机缺少缓存包而未完成安装；实际容器构建完成生产依赖安装。定向部署脚本测试 2／2。再次运行正式更新退出 0，业务库结构 `check` 通过。Server 与 Worker 同为 healthy，镜像从 `145d6f91a4ef` 更新为 `2e7d6419d1d8`。本次构建包含当前共享工作区后端代码。

## 目标容器业务验收

| 真实回执 | 目标 Server 隔离保存的版本 | 唯一差异 | 原冻结结果校验值 |
| --- | --- | --- | --- |
| day | `ab56ad6a-8df1-4189-b5b6-74b4d9ec8311` | `buy` 从两根改为当天；仅 5 月 19 日买入 | `633620e5cabf5339` |
| two-bars | `92a74867-474f-4c45-879d-59f1616c1c2d` | `buy` 从当天改为两根；5 月 19、20 日均买入 | `0b74741371f64882` |

在运行中的 Server 容器内另起验收进程，加载镜像中的提交、执行、提案、确认和保存服务。隔离执行器直接领取操作，SDK 的 HTTP 传输只返回内存中的受控基线和归档响应。隔离库没有发布端口。历史响应与普通委托计划的完整 v5 响应分别通过各自的正式入口。这一层验证服务实现与数据库事务；正式 HTTP、队列和浏览器交互沿用上轮独立验收。

- 两份短响应均命中 `authoring-order-validity-v1`，实际生成合同及系统消息与归档相同。用户输入仅修订号使用隔离草稿的 2。唯一差异路径均为 `execution.orders.0.validity`。
- 待确认时仍是原定义，提前保存和过期确认均返回冲突。重复确认只产生修订 3，重复保存得到同一版本。数据库重读的完整配置逐项等于合格回执，来源记录包含受控生成、放弃的 v5 对照提案及已采用的短输出修改。
- 入场、退出、仓位、风险、费用、交易计划和委托计划七个普通修改范围在两份基线上均使用完整 v5 包装并拒绝短响应。两份普通“委托计划”真实完整响应均经正式提交与执行得到正确提案，随后在隔离草稿中放弃。目标 readiness 返回修改用途 v5、原生模式、ready，已有资格为 passed。
- 保存重读所得策略的哈希与原快照 manifest 一致。在 Server 和 Worker 各比对 11 个编译模块，再逐样本执行两次正式冻结 Runner。两容器共八次回放，完整结果和中文回读都与归档一致。临时快照目录、临时数据库容器均已清理。两份隔离保存的版本 ID 留在回执内。

## 命令与回执

在主仓运行部署预检与载荷的定向测试。镜像更新与目标核对在相邻 infra 仓库执行。以下 `APP` 指主仓的绝对路径。

```sh
rtk proxy node --test scripts/deployment/prepare-code.test.mjs
rtk proxy env DEV_DATABASE_MODE=check npm_config_registry=https://registry.npmmirror.com ./scripts/update.sh thesis-ledger
rtk proxy node scripts/infra.mjs locked --idle -- node "$APP/scripts/local-runtime/run-authoring-order-validity-target.mjs" "$APP/var/acceptance/order-validity-target-20261119-ynqrEw/target"
```

更新失败与成功日志分别为 `update.log` 和 `update-packaging.log`。新镜像与容器身份见 `after-update.txt`。验收入口退出 0；同目录下的 `target/saved.json` 保存两个版本及差异，`target/thesis-ledger.json`、`target/backtest-worker.json` 对应两角色的回放，`target/passed.json` 关联镜像、模块与路由，`target/cleanup.json` 记录隔离库清理。[目标验收入口](../../scripts/local-runtime/run-authoring-order-validity-target.mjs) · [服务端回执重放](../../scripts/local-runtime/authoring-order-validity-target.mjs)

**镜像更新当时的快更兼容性。** 新镜像已包含 `yaml@2.9.0`。只读比对发现 pnpm 在打包后的 Server 清单自动增加四个 workspace 包的 `dependenciesMeta.injected`；其他顶层字段相同，三个 workspace 包各自的清单逐字相同。现行快更预检比较 Server 清单的完整字节，这项生成差异仍会使后续纯代码快更被拒绝。详见 `manifests-after.json`。本轮目标业务验收使用正式镜像，未改快更兼容门禁。

## 11 月 19 日后续修复：纯代码快更清单预检

主仓的 `sync-preflight` 首先按原方式逐字比较。仅对 `/app/package.json` 的差异启用第二步：以源码 Server 清单为基准，要求 `dependencies` 的 domain、schemas、shared 及 `devDependencies` 的 api-client 均为原有的 `@thesis-ledger/*`、`workspace:*` 引用，且源码未声明 `dependenciesMeta`。在预期镜像清单中为这四项各添加 `{"injected":true}`，再按 JSON 结构比较完整清单。其他字段及各项元数据必须完全匹配。三个 workspace 包各自的清单仍按字节核对，Prisma 目录仍按完整目录核对。[预检入口](../../scripts/deployment/prepare-code.sh) · [Server 清单比较](../../scripts/deployment/match-pnpm-server-manifest.mjs)

复用上次 `after-update.txt` 的两个容器 ID，以只读的 `docker --context desktop-linux exec <容器ID> cat /app/package.json` 分别取回完整清单。两份文件各 2,077 字节，SHA-256 均为 `e791be8f85544e74c3714be378cd9ab7a0f7b1122739113774d0c44cf59017a7`，与上次 `manifests-after.json` 记录的唯一差异及四个标记逐项相符。源码清单为 1,788 字节，SHA-256 为 `d8ea5db06bef604bd133b40dff65a008f52a7ddfbb2873667f69bccda30d0c72`。

在主仓对正式入口 `bash scripts/local-deployment.sh sync-preflight` 做离线重放，Docker 文件读取由本地文件替代。Server 清单使用上述原始字节，其他包清单和 Prisma 目录在两侧均取工作区同一份输入。

| 输入 | Server 清单 | Worker 清单 |
| --- | --- | --- |
| 真实镜像清单，含 `yaml@2.9.0` 及四个注入标记 | 放行，退出 0 | 放行，退出 0 |
| 构造反例，仅删除镜像的 `dependencies.yaml` | 拦截，退出 1 | 拦截，退出 1 |
| 构造反例，仅将镜像的 `yaml` 改为 `2.8.0` | 拦截，退出 1 | 拦截，退出 1 |

在主仓执行的定向命令如下。

```sh
rtk proxy node --test scripts/deployment/prepare-code.test.mjs
rtk proxy bash -n scripts/deployment/prepare-code.sh
rtk proxy node --check scripts/deployment/match-pnpm-server-manifest.mjs
rtk proxy python3 var/acceptance/sync-preflight-manifests-20261119-gopde6nb/replay.py
```

定向测试 3／3 通过，语法检查与六组回执重放均退出 0。测试另覆盖缺失、额外或值错误的注入标记，源码显式元数据，workspace 引用变化、其他依赖及顶层字段变化，以及三个包清单、Prisma 和载荷的既有门禁。原始清单、重放脚本及逐案退出码位于 `var/acceptance/sync-preflight-manifests-20261119-gopde6nb/`。本次验收止于宿主预检，部署、提交、推送次数均为零。
