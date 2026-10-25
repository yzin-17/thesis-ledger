# G3-D28：验收快照门禁修复与 trace 部署

## 结论与授权边界

297项验收快照解析错误已解除，原全仓复杂度门禁与常规lint均通过。已从 `thesis-ledger-infra` 正式入口执行最小 `thesis-ledger` 快更，脚本退出0；独立核对 Server／Worker 及实际Schema包、关闭状态和保护基线通过。

本轮真实模型调用0，V2保持关闭，余7次冻结。旧业务数据、配置、挂载及验收包保留；未stage／commit。部署位于容器可写层，镜像未更新；真实选中业务任务的文件捕获、容器重建持久化及OpenRouter采样仍未验，G3整体尚未通过。

## 门禁修复

原 `lint-workspace.mjs` 先发现文件、后把整个scope目录交给ESLint重新扫描，导致既有Git ignore之外的验收源码快照被重新展开。297条fatal均来自未属于项目tsconfig的release快照。

修复由 `scripts/workspace-lint-sources.mjs` 负责源码归属：使用Git已跟踪文件与未被现有ignore排除的未跟踪WIP并集，再应用原ESLint文件规则；使用NUL分隔支持中文／空格文件名，过滤已删除文件与目录，Git读取失败直接停止。执行阶段使用精确文件列表，避免重新遍历整个应用目录。

没有修改 `.gitignore`、ESLint类型规则、project service许可或复杂度阈值。Git已跟踪且后来被ignore覆盖的源码仍在候选中；正常未提交源码及trace的11份新源码继续检查。验收包保留原位。

| 检查 | 结果 |
| --- | --- |
| `node --test scripts/workspace-lint-sources.test.mjs` | 6项通过；验证WIP、中文／空格路径、已跟踪ignored候选、删除、Git失败、真实嵌套三元仍失败 |
| `node scripts/lint-workspace.mjs --guardrails` | 8组／2665文件通过；103.6秒，原复杂度规则保持 |
| `node scripts/lint-workspace.mjs` | 9组／2672文件通过；94.7秒，`--max-warnings=0` 保持 |
| `node scripts/check-boundaries.mjs` | 通过 |
| `node scripts/check-workspace-dependencies.mjs` | 8包通过 |
| `node scripts/check-file-size-guardrails.mjs` | ratchet通过，保留10项原警告 |
| 本轮修改范围 `git diff --check` | 通过 |

两次清单计数不同包含常规模式额外8份scripts输入，以及并行移动端WIP从237变为236份的变化；没有为对齐计数回退WIP。D27应用源码未被本轮修改，原33项trace／110项定向、Server包3437项通过及356项条件跳过证据复用，正式入口按要求重新构建实际payload。

## 正式部署回执

- 执行目录：`/Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra`。
- 实际入口：`./scripts/sync-code.sh thesis-ledger`，退出0。
- 非敏感参数：临时PATH包含Volta；`COREPACK_NPM_REGISTRY`、`pnpm_config_registry`、`npm_config_registry` 使用 `https://registry.npmmirror.com`；`npm_config_disturl=https://npmmirror.com/mirrors/node`。未传入AI写入开关或策略覆盖。
- 兼容性：目标容器均运行、镜像引用一致，Server及3个workspace package manifest、完整Prisma目录与目标一致。正式脚本内置预检通过，选用最小快更，无需 `update.sh`。
- 仅重启 `thesis-ledger` 和 `backtest-worker`；2026-10-25 17:47:33（Asia/Shanghai）启动。5容器身份、镜像和挂载保持；Postgres／Redis／DSA未重启。
- 两面镜像均保持 `sha256:76f0c84c3db2fb37c413682861b0f71f4789be8c1f7d59fc642229861b1ff382`。脚本未执行数据库结构或外部卷变更。
- [本机执行日志](../../../.recovery-artifacts/g3-d28-20261025/sync-code.log)。

## 独立运行态核对

更新前两面均不存在trace模块；更新后存在。下列实际目录中的全部文件摘要，两面均与宿主构建输出一致：

| 运行时目录 | 每面文件数 | SHA256 |
| --- | --- | --- |
| Server `dist/src` | 2037 | `03c0f35f4f40adba2520df4fac725e7fcbe10412291937a3fe1c895bbd258771` |
| schemas `dist` | 579 | `03d09582e3613e5262a20ef09ae9d15cde6dcb2d67e45c8fd12a876885fda17b` |
| domain `dist` | 243 | `286800e7b0b121d80f0eb1a0f5ee4cf0e55b6245b161ccc8e4d718243985db67` |
| shared `dist` | 3 | `7bbf347ce70d9a9a9a8292bf1d8de53227aad692939da2a0be3f77d0ba292a93` |

实际加载的Schema入口为 `/app/node_modules/.pnpm/@thesis-ledger+schemas@file+packages+schemas/node_modules/@thesis-ledger/schemas/dist/index.js`。两面各自调用已部署的SDK、trace上下文、HTTP拦截器及完整V2 Schema：使用内存受控Response和内存artifact sink，生成原文被Schema拒绝时仍与SDK异常文本一致，trace捕获完整，`runtime.httpResponse`存在。每面受控transport1次、外部网络尝试0、业务数据库写入0。探针进程将全局fetch设为拒绝，未读取Provider凭据；不能把这个内存检查称为真实Provider或实际私有文件捕获。

5容器均健康。重启后Server最多200行／Worker有界日志中，未发现错误级、缺模块、缺表或ENOSPC信号。真实 `GET /api/v1/research/capabilities` 更新前后均200、`version=research-capabilities-v2`、`canCreate=false`；待执行研究均0。

私有根为 `/app/var/backtest/ai-traces`，当前尚未创建；两面父目录 `/app/var/backtest` 由同一 `thesis-ledger-backtest-data` RW卷承载，UID100／GID101具备写入和进入权限，父目录0755。本轮仅检查挂载与权限，没有触发真实业务trace文件创建；实际文件模式、选中任务捕获及重建反读仍由独立验收负责。

## 保护核对与一致性评审

- 数据库名／owner均 `thesis_ledger`，Schema head保持 `20261023010000_report_metadata_snapshots`。22张保护表完整行计数／摘要／行摘要列表全部保持；8条原AI记录与88条工具记录保持，未新增研究、工具或AiInvocation记录。
- DSA四张控制表、20条路由及准入范围保持；两面全部环境值摘要保持。Server V2为false、Worker未设置V2写入开关，两面均无研究策略环境覆盖。
- 5容器全部挂载属性保持，两个目标以外的启动时间保持。infra `.env` 内容摘要、infra／DSA原有tracked diff和未跟踪WIP内容摘要保持。
- 验收包原22,452文件、4,709,504,479字节的元数据摘要 `c1c280077457c1bfce150833be2c42c0aa4e183d7d70e8ea7d976d15c17fd857` 可从当前包精确反读；359份原TS内容摘要保持 `9ff1e5de84db45d90a9befa35b31e7cd019bfe088087531fb43b5a30c4580a8e`。核对期间并行batch6新增文件，原文件未改，新增内容同样保留。
- 主仓同时存在外部移动端源码／文档WIP更新，因此不声称整个工作区被锁定或总diff摘要不变。本轮写入仅限lint清单／入口／测试、原Spec／Task、本证据及私有操作记录；未回退其他WIP。三仓暂存区均空，main／infra HEAD保持原值。

最终一致性评审：D28授权范围通过，门禁与源码清单、正式脚本回执、部署模块及数据保护证据一致；无未处理的D28阻断项。D27／G3仍保留真实选中任务捕获、OpenRouter正文／业务成功及重建持久化等未验门禁；部署不解除剩余7次冻结。

机器摘要见[部署证据JSON](2026-10-25-g3-trace-deployment.json)。完整本机只读基线见[部署前](../../../.recovery-artifacts/g3-d28-20261025/before.json)与[部署后](../../../.recovery-artifacts/g3-d28-20261025/after.json)，这些私有文件未进入Git。
