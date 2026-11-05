# R02 HiThink 报价准入纯判定接缝（2026-09-29）

## 当前代码与边界

DSA 新增 `thesis_ledger_hithink_quote_admission.py`，为股票 `a-share-prices-snapshot` 与 ETF `fund-market-snapshot` 分别固定 `CN/REALTIME_QUOTE` 的 `data` RouteKey、适配器修订和本地请求合同修订。纯判定函数检查精确 RouteKey/RouteTarget、带后缀证券代码、证据引用/摘要、正整数记录版本、已准入且未撤销状态、记录时间与有效期、上海日期范围，以及用途隔离的 HMAC 凭据修订。ETF 不能消费股票准入；裸代码、错误来源、旋转凭据和晚到记录均拒绝。

该模块不读 Key、不访问外部服务、不写 SQLite，也不改变当前 Control/Runtime 的 `not_admitted` 状态。`sourceRevision` 指本地请求合同，不冒充供应商行情内容或历史修订。独立[选择和真实单标探针](2026-09-29-cont-r02-hithink-quote-selection.md)仍只证明目标账号当次可读。

## 验证和剩余工作

新增纯判定 18 项，连同快照适配器及原门禁共 32 项通过；新模块与测试 `flake8`、Python 编译及 DSA `git diff --check` 通过。覆盖正向股票/ETF、各自串用、撤销、失效、来源/适配器/凭据修订、范围/有效期、未来记录、错误证据与裸代码。

`R02-quote-state` 仍需把当前 `RouteAdmissionV3`、凭据 HMAC 和本判定接入 Control 的 Quote 目标可用性及运行时读前读后核验，并验证策略/目录修订。生产 `_realtime_quote` 仍未调用 HiThink 适配器，目标 V2/V3 当前都没有 HiThink Quote 路由；没有执行 DSA HTTP、Server 消费或目标准入写入。父项及 R02.2/R02.4 不勾选。
