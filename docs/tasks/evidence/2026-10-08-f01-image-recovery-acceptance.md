# 当前镜像、自动回滚清理与恢复验收

关联：[精简F01](../../archive/tasks/2026-10-03-multi-source-remaining-acceptance.md#minimal-release-closeout)、[恢复入口验收](../../../../thesis-ledger-infra/docs/archive/tasks/2026-10-08-current-state-recovery.md)、[空间整备](../../../../thesis-ledger-infra/docs/tasks/docker-build-space-guard.md)。仅完成当前版本保留范围，不更改P6-E1/F3输入资格。

## 更新与清理

用户明确允许清理并要求更新脚本自动处理回滚镜像。常规保留数`ROLLBACK_IMAGE_KEEP_COUNT`默认2；缓存/常规镜像整备及Docker Desktop空闲块回收仍不足时，使用`BUILD_SPACE_ROLLBACK_KEEP_COUNT`默认1再次整备并复测。运行镜像、更新前基线、显式保护和本次构建产物不受数量目标限制；只删除重新核实的精确历史回滚标签，不删除备份或数据卷。关闭修复时不清理，读取/清理失败或余量不足仍停止。

正式命令在infra执行：

```sh
DEV_DATABASE_MODE=check PULL_SERVICE_IMAGES=false PULL_BASE_IMAGES=false ./scripts/update.sh all
```

首轮因容量不足在构建前退出1；新增整备后的正式执行完整退出0。删除获准旧Server `fc4df9e94993…`与DSA `b66af4e91a4b…`，实测宿主23572 MiB、Docker20661 MiB达到20/18 GiB门槛后开始构建。目标选`all`，因为共享公告准备实现同时新增DSA生产者和Server合同，两者此前均仍有可写层更新。

| 组件 | 当前镜像 |
| --- | --- |
| DSA | `sha256:5260ad9aec568d7a0ae0ec509eade36126f2836342dbd5117255d09657e47f60` |
| Server/Worker | `sha256:46b4ff775cbc6d1add09a84a28dfe20d3da7eddc0e4d92b04db3268dc360b1e2` |
| PostgreSQL | `sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24` |

五容器healthy；Server `/api/v1/health`、DSA `/api/health`均HTTP200。1692项记录的运行源码指纹前后无变化；容器与宿主591份Server编译JS、114份当前Schema JS、69份当前Domain JS、476份DSA Python逐字节一致。宿主11份已无对应源码的旧编译文件单独排除并记录，不把它们计入当前源码证明。命名业务卷保留，7张关键业务表/17条成功V3/结构head及DSA在线SQLite摘要与更新前一致。

## 备份与恢复

新私有备份位于infra `.maintenance-backups/f01-current-20261008`，Manifest绑定上述实际镜像和结构head `20261006030000_strategy_authoring_save`；目录0700、载荷和Manifest0600，完整字节摘要校验通过。不包含环境凭据，恢复依赖本机仍可访问的版本镜像。

| 载荷 | 字节 |
| --- | ---: |
| `postgres.dump` | 3213528 |
| `dsa.sqlite` | 4370432 |
| `dsa-data.tar` | 5580800 |
| `backtest.tar` | 1256960 |

在infra执行的入口：

```sh
node scripts/research-state-backup.mjs backup --target thesis-ledger-dev --output <全新私有备份绝对目录>
node scripts/research-state-backup.mjs verify --target thesis-ledger-dev --output <已有备份绝对目录>
node scripts/research-state-rehearse.mjs --bundle <备份绝对目录> --confirm-isolated --retain-output=<全新私有恢复目录> --run=<成功V3任务ID>
node scripts/research-state-rehearse.mjs --cleanup-receipt <输出回执绝对路径> --confirm-isolated
```

恢复模式建立无端口/无网络、随机命名且带所有权标签的隔离PostgreSQL；恢复数据库、DSA目录/SQLite和冻结制品，保留模式返回可取用副本及清理回执。默认模式演练后自动清理。实际保留模式验证了结构head、7张表和完整任务清单一致、SQLite完整性ok；以下四条任务使用新Worker镜像及恢复制品各重放两次，网络0。

| 场景 | 任务 | 结果摘要 |
| --- | --- | --- |
| ETF现金分红 | `cb8c5fdb-b16b-4d2b-aba7-3e9567446930` | `62957fa06013f9a3` |
| 退市 | `b049cd97-5404-49c2-85a8-c1de695afc65` | `58b993fdf96df42d` |
| 港股四项公共收费与富途成本 | `d555954d-a545-4845-aaf6-e5be5cf245a3` | `767245e2c4ddc33b` |
| 美股参考股价成本 | `b8de7bc7-cb62-41d8-8681-a2e1b0184462` | `981757d2b91e80a1` |

随后按回执核验所有权并清理专属容器/恢复子目录，无遗留标签容器，源保护状态不变；原备份未删。基础旧镜像曾拒绝新的港股成本合同，此次新镜像重放通过，补齐了该缺口。页面及实际下载复用输入未变的P6证据；本次没有改页面或计算逻辑，不重新执行同一套人工验收。

## 验证记录与范围

空间Shell回归通过，回滚计划/删除器37项Node测试和保留脚本11场景通过，数据库保护脚本、infra兼容检查和语法检查通过；恢复脚本5项Node测试通过。最终工作树diff检查通过。没有提交或推送。

最终一致性Review通过：精简F01的镜像、源保护、版本备份、实际恢复和清理义务均有对应证据；失败过程保留，未重启取消义务。恢复叶任务已归档，当前Spec保留；父Task因P6-E1/F3继续活跃，无新增TODO。

完整日志/回执在主仓忽略目录`.recovery-artifacts/m31-2026-10-07/`：`f01-image-update-with-rollback-cleanup.log`、`f01-image-content-check.json`、`f01-current-backup.json`、`f01-current-verify.json`、`f01-current-rehearsal.json`和`f01-current-restored-cleanup.json`。前置失败日志及全部历史备份保留。本机隔离恢复不宣称异地灾备、覆盖当前目标恢复或旧版本组合回退；已取消高级义务不重新纳入。
