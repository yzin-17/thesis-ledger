# 富途沪深 A 股日线接入与账号验收

## 范围与实现

2026-11-10，DSA 为 `CN/STOCK/DAILY_BAR/1d` 增加不复权、前复权、后复权三条绑定。保留原港美十二条绑定顺序、来源修订、隔离进程及完整分页行为。新绑定复用 `FutuMarketAdapter`、`futu_query_worker`、`read_futu_history` 与标准日线合同，没有新增提供方分支或并行读取器。

沪深日线只接受 A 股股票代码与股票类型，仍由 SDK 静态资料交叉核对原生代码和资产身份；不接入 ETF、指数、B 股或北交所。新绑定不声明研究日历或研究身份资格，不改变历史冻结结果。官方依据为[历史 K 线接口](https://openapi.futunn.com/futu-api-doc/quote/request-history-kline.html)及[权限与额度](https://openapi.futunn.com/futu-api-doc/intro/authority.html)，账号可用结论以本次实读为准。

## 当前账号实读

通过明确只读的控制库连接取得当前 OpenD 配置：方法 `opend`、配置版本 1、保存目标 `host.docker.internal:11111`。该名称只在 Docker 网络内解析；宿主机只读检查确认 `Futu_Open` 在 `127.0.0.1:11111` 监听。实测从宿主机连接同一 OpenD 进程，未修改保存的主机、端口、凭证或登录账号。

使用新增维护脚本：

```sh
cd daily-stock-analysis
.venv/bin/python scripts/probe_futu_cn_daily.py \
  --host 127.0.0.1 --port 11111 \
  --start 2026-11-02 --end 2026-11-06
```

脚本经统一能力绑定调用生产适配器，并使用生产日线验证器；仅有界读取两个标的的三种复权，不自动重试，不访问或修改控制数据库，不创建交易上下文。

观察时间为北京时间 2026-11-10 17:24:27；SDK 版本为 `10.8.6808`，六个整窗全部成功，各返回 2026-11-02 至 2026-11-06 的 5 根日线，成交量与成交额均存在。原始响应摘要如下：

| 标的        | 复权   | 根数 | 响应 SHA-256                                                       |
| ----------- | ------ | ---- | ------------------------------------------------------------------ |
| `600519.SH` | `none` | 5    | `aa005cf4696f54424db2dcd90a546288f55cf0c2a6c700066d4f046bf52b67a2` |
| `600519.SH` | `qfq`  | 5    | `aa005cf4696f54424db2dcd90a546288f55cf0c2a6c700066d4f046bf52b67a2` |
| `600519.SH` | `hfq`  | 5    | `83b7a47166aa752767a0d51dc327929ffde47be6eeb72e398ada13178660cfc7` |
| `000001.SZ` | `none` | 5    | `ede4fcf1490bb3c2e866302f2c675af6c6be4309ebf23a993cd144b4e6d50b54` |
| `000001.SZ` | `qfq`  | 5    | `ede4fcf1490bb3c2e866302f2c675af6c6be4309ebf23a993cd144b4e6d50b54` |
| `000001.SZ` | `hfq`  | 5    | `bcdcac308aa9ec4d6ee0aee9eb7e97106358b0cca50d4dc808c539224515aac4` |

首个读取耗时约 3.3 秒，其余各约 0.34–0.38 秒。日志 `/tmp/futu-cn-daily-live.log`。六次预算已用完且全部成功；后续目录和浏览器验收未追加价格读取。成功证明当前账号可读取这两个样本的三种日线口径，不扩大为全部证券、任意窗口、未来持续可用或历史可交易性结论。

## 本地验证

- 定向 pytest：`test_futu_daily.py`、`test_thesis_ledger_futu_capability_path.py`、`test_thesis_ledger_futu_minute_capability_path.py`，66 项通过，覆盖两所三复权、两页完整性、SDK 参数、晚到错误、循环游标、身份与窗口拒绝、资源释放及内地其他资产拒绝。
- 首次将新增绑定放在原绑定之前，使部分既有测试取到不同的首项；调整为追加三条绑定，保留原顺序后通过，未放宽测试断言。
- 富途相关数据测试及统一注册测试从 `scripts/data_test_scope.py --list` 的允许清单选取，1101 项通过；日志 `/tmp/futu-cn-daily-regression.log`。第一次宽泛 glob 被数据测试护栏拒绝，因为包含已退役的产品测试；随后使用正式清单，未跳过护栏或恢复退役测试。
- 全部运行代码语法检查通过：471 个运行文件、1 项动态导入。修改文件 flake8 关键错误为 0。
- `check_thesis_ledger_capability_boundaries.py`、`check_data_runtime_contract.py`、`data_test_scope.py` 通过；`git diff --check` 通过。现有弃用及测试收集警告保持。

## 目标运行态

从 `thesis-ledger-infra` 执行正式维护入口：

```sh
./scripts/sync-code.sh dsa
```

退出为 0，兼容预检通过，仅同步 DSA 代码并重启 DSA 容器，健康恢复。日志 `/tmp/futu-cn-daily-sync.log`；未更新数据库结构或外部卷，ThesisLedger、Worker 及其他项目容器不在更新目标内。

镜像 ID 保持 `sha256:f930872e11054d8ffe3532d93e95e8e1b1261b2d57ae8b846f43bfd98ffc2a25`。本次是可写层快更，不是镜像发布，重建会恢复镜像版本。

独立验证包括：

- 实际 Server `GET /api/market-data/routes/capabilities?contractVersion=3` 返回完整目录，新增三条富途内地股票日线均为 `ready`、来源 `futu`，提供普通日线 `query` 语义。
- 容器 SDK 亦为 `10.8.6808`；容器和本地实测代码摘要一致：`futu_history.py` 为 `45a86b9887ab985ae2223ea377dbeef9840bc93a36b913f6796350b43f0d728a`，来源模块为 `36ae1de9a07eb390ec21562051cf8a91b598093866449ecceb5e759575d94936`。
- DSA 为 `running/healthy`，更新后日志显示启动完成，检查窗口内未出现错误或异常堆栈。

## Desktop 消费

`apps/desktop/scripts/check-futu-cn-daily.cjs` 在 1440、1024、768、390 四宽，通过实际 Vite 及实际能力目录，逐一确认三种复权的沪深股票日线均有可选的“富途 OpenAPI”，不再显示该能力未接入。未点击选择、未产生草稿修改，所有非只读请求禁止透传，真实写入及浏览器错误为 0，布局未越界。

结果及布局截图位于 `/tmp/futu-cn-daily-ui/`，已查看 1440px、390px 截图；来源选项状态由浏览器 DOM 断言确认。此阶段只验证目录消费，没有重复调用行情接口。

## 最终核对与回退

AC1–AC2 由注册、完整链路与回归测试覆盖；AC3 为六次实际 SDK 整窗读取；AC4 为维护脚本、部署摘要、实际目录和四宽页面检查。当前主备、凭证、历史数据及冻结结果未修改，无本范围未完成事项。

如需回退，恢复本次 DSA 来源和历史读取代码后通过同一 `sync-code.sh dsa` 入口同步；不回滚业务策略或数据库。主仓及 DSA 中文规格、长期适配说明和 Changelog 已同步；本次专题没有对应英文镜像文档。未执行 Git 提交、推送或镜像构建。
