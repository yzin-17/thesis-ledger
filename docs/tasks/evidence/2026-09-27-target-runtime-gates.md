# 目标运行态协议与回测前置验收

## 当前结果

日历发布与目录后续：官方 `update.sh dsa` 经权限重试退出 0，固定依赖进入新镜像 `sha256:d4a11dfbf07eba886f9b385aa028dbedde0b8f8d997e97a82f9d0163834192d0`；构建期间新增源码通过后续官方 `sync-code.sh dsa` 补齐。目标日历包 93 文件摘要匹配发布证据，实际 DSA HTTP 经生产 Client、完整快照和离线 Runner 重放通过，发布前不可用。V3 协议再次通过。目录 920→BJ 与 NaN 名称拒绝在目标进程内核验通过，但未执行真实全量目录刷新。R01.10 已收口，其他来源及 G-Run 不受此勾选替代。

结算日历 HTTP 补充：`sync-code.sh dsa` 同步最新日历范围修复后退出 0，DSA 健康、镜像不变；日志 `/private/tmp/goal-dsa-calendar-sync-20260927.log`。目标 `/api/v1/thesis-ledger/v2/calendar` 接受 start=2026-05-18、end=2026-06-06、dataAsOf=2026-05-21，返回 supported、完整范围与 `exchange-calendars-4.13.2`；超预算 end=2027-01-01 返回 422。探针 `/private/tmp/probe-settlement-calendar-20260927.py` 通过，仅只读日历，不构成 G-Run。

2026-09-27 后续代码同步：infra `./scripts/sync-code.sh thesis-ledger` 退出 0，兼容性预检、宿主构建、Server/Worker 同步及健康检查完成。日志 `/private/tmp/goal-calendar-sync-20260927.log`。两容器镜像保持 `sha256:f51e7f52e3ce141fa29517afae0005ff9c9c19d12009b0a6d8b3f4539ea49b7a`，未修改数据库结构或外部卷；同步只存在于容器可写层。

核验 `/app/apps/server/dist/src` 下三个关键文件，两容器与宿主构建 SHA-256 一致：结算日历 `3096c4eae2372a74f733d52cfac44c3aa11c5fab40d1fcbc623bff4c5cca63b3`，队列适配器 `9764c5680ac10ccfc47e83b55956c4d779f329e40860e80afc113ae12f0e45c0`，拆分映射消费者 `d0cdf03c07e6336a0726f30a2960db212de7a59fe7bd40d333e2fa1b656c4e12`。首次误按 `/app/dist` 查询返回缺文件，改用脚本实际同步路径后核验成功，不是部署缺失。

该证据确认消费者源码已进入目标运行态；未执行真实来源回测，不关闭 G-Run/G-M2，也不把健康检查当业务验收。

后续 DSA 同步：拆分映射、事件入口、字段单位、来源读取与证据存储共 83 项测试通过后，infra `./scripts/sync-code.sh dsa` 退出 0，日志 `/private/tmp/goal-dsa-sync-20260927.log`。目标三个文件与宿主 SHA-256 一致：`thesis_ledger_split_mapping_v3.py` 为 `559b1a8de25d61f0ae1c4e3350cb7589c1dc1839789e155fbd02909ddd33df25`，`thesis_ledger_split_event_reader_v3.py` 为 `9a4049e40f40f4e68e72696609dc9060a1b43b880e6183b5b04b64c5018c750b`，`thesis_ledger_source_basis.py` 为 `d805dbd786266a071c331d2cedd3124cba057db7954d7fe6d385fbf3ad89bd8c`。

同步后官方 `scripts/market-v3-contract-test.sh` 通过：Data/Control 合同均为 3，独立 Data 鉴权为 `verified-without-market-read`，当前目录修订 `953208131319670`。令牌从目标服务环境传给检查子进程，未输出或写入文档；未请求行情、写入准入、创建真实回测或 AI 作业。

2026-09-27 官方保留数据升级后，Server、Worker、DSA、Redis 与 PostgreSQL 均健康。数据库升级证据见 [升级任务](../../archive/tasks/2026-09-27-preserve-data-database-upgrade.md)。本记录仅覆盖本次实际执行的协议与来源前置检查。

## 协议门禁增强

- 原门禁检查 Data 版本声明、Control 握手、真实目录及非法凭据拒绝。新增独立 Data Token 的正向鉴权验证：发送 `contractVersion=0` 和请求 ID，要求返回 HTTP 422、严格 V3 `unsupported_data_contract_version` 错误及相同请求 ID。该输入在请求解析阶段退出，不进入行情运行时。
- 缺 Data Token、错误 Data Token、错误响应身份均拒绝；不以 Control 握手成功推断 Data 鉴权可用。
- 实施文件：`scripts/market-v3-contract-probe.mjs`、`scripts/market-v3-contract-smoke.mjs`；infra 使用说明同步要求分别注入两种令牌。
- `node --test scripts/market-v3-contract-probe.test.mjs`：9 项通过；定向 diff check 通过。
- 目标 `scripts/market-v3-contract-test.sh`：通过，输出 `dataContractVersion=3`、`controlContractVersion=3`、`dataAuthentication=verified-without-market-read`，目录 revision 为 `2660923349908721`。凭据只经子进程环境传递，未写入文档或输出。

## G-Run 前置卡点

- 真实目录完整，但 HiThink ETF qfq 与股票 none/qfq/hfq 四项均为 `not_admitted`；容器环境未提供 `HITHINK_API_KEY`。环境存在性检查不代替加密凭据存储的完整诊断。
- 使用实际 Data Token，固定 `159516.SZ`、`2026-05-16..2026-08-09`、CN/ETF/DAILY_BAR/1d/qfq，目标 pin 为 `hithink / fund-market-historical / 0`。
- 首次请求与两次重试均 HTTP 503、V3 `upstream_failure`；目标 DSA 脱敏日志对应 `NO_ELIGIBLE_PROVIDER`。重试请求 ID 为 `goal-admission-target-retry-1`、`goal-admission-target-retry-2`。
- 按用户卡点规则跳过本轮 G-Run 正向运行；未创建回测或 AI 实验，未把接口拒绝当作普通回测通过。G0-H、G-Run、依赖它们的完整 G-UI/G-AI 继续未完成。恢复条件是同一目标来源完成真实准入及可用凭据配置，不换标的或使用 fixture 替代。

## 剩余清单校正

- U04 的窗口 API 与 Desktop 实际窗口接线已经在源码和主 Task 中完成；本轮没有重复实现。剩余为真实兼容证明、目标挂载/撤销、真实图表及 Electron 验收。
- G-Deploy 的数据库升级阻塞已经解除，但完整主门禁仍须核对其余依赖，不因服务健康直接关闭。
- M31 官方基金分红文档入口当前返回 404/不可取得，搜索缓存还存在 `fund_type` 参数是否必需的差异。当前不据缓存推定新接口合同；保留后续核验，不生成未核实的正常化规则或开启路由。
