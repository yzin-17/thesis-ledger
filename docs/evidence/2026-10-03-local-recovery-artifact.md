# 当前版本本地恢复制品验收

## 产物与范围

包位于 `.recovery-artifacts/2026-10-03-current/`，已被 Git 忽略；目录权限 0700、文件权限 0600。四份镜像覆盖 Server/Worker、DSA、PostgreSQL 与 Redis；备份覆盖 PostgreSQL 一致性状态、DSA SQLite 在线备份、完整 DSA 数据目录和冻结制品。运行环境凭据未单独导出，业务备份按敏感数据保管，未上传远程服务。

`manifest.json` SHA-256：`91ff12b5bb33e90407856b2e605f2b8329e85ae670bd1ab2e22e136e961414b3`。

| 文件 | 字节 | SHA-256 |
| --- | ---: | --- |
| `postgres.dump` | 18700277 | `4bb6cebf4717dd801198e103c6511688ef2fd2c79d69e77a7857e0a993c9747d` |
| `dsa.sqlite` | 25616384 | `d2a3037a19dcde967d2951086e4a310a1b17de7978fdddb64804b57dc0033118` |
| `dsa-data.tar` | 87700480 | `580b09b37dca0d312e1a5550be7176a2b83a5603c948931d25e9837aebf5eb1c` |
| `backtest-snapshots.tar` | 14993408 | `d1e4c7bfd15af8e9875ce0e13cd9f2389b13deaf889dbded27d876d7f51e22e4` |
| `images.tar.gz` | 853089186 | `f7379cc25980e93b0b1356f70f4ef7130cd228787ea25e09c291bfc66ef60122` |

五文件合计 1,000,099,735 字节，约 0.93 GiB。包内说明和 `verify.mjs` 提供默认只读校验与可选镜像导入；不作为覆盖业务卷的自动恢复入口。

## 实际验收

镜像压缩包完整性校验及实际导入通过，原镜像 ID 集合不变。从已落盘且核对 SHA-256 的包文件恢复全新隔离环境，五服务健康；应用角色权限、V3 协议/鉴权、目录与策略身份、账户及四条 Run 读取通过。实际冻结重放结果仍为 `4a11f72fb3b0ae7f`、`01fec3349070ad49`、`cb560dbe65dbe802`、`f310629effbdb556`。

源业务、目录和策略身份不变，原 48 卷集合摘要不变，临时资源残留 0。六个现有容器均 healthy，构建缓存 0B，主机剩余约 25.39 GiB。包内 `node verify.mjs` 及 `node verify.mjs --load-images` 均实测 passed。

日志：`/private/tmp/thesis-ledger-recovery-bundle-20261003.log`；入口：`/private/tmp/thesis-ledger-image-restore-20261003.mjs`。

## 剩余回退门禁

[组件候选核验](2026-10-03-component-rollback-compatibility.md)证明旧 Server/Worker 的冻结重放与当前结果不一致，旧 DSA 改变当前目录身份；两者均没有当前状态回退资格。相邻 infra 的 10 份历史 PostgreSQL dump 没有对应 DSA SQLite 与冻结制品备份，不能拼成已证明同批的旧状态。

本地包完成当前版本的可取回和恢复验证；异地长期存储、完整旧状态及合格旧版本回退继续保持未完成，原 F01 不关闭。
