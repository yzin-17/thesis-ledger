# R02.17 RQData 场内 ETF 历史 Bar 候选核对

日期：2026-09-29。范围：只读核对官方接口、当前 DSA 接线与现有 Server Consumer；未读取账号、调用 RQData、写入 Control 或更新容器。

## 已核事实与候选

- RQData 官方[场内基金行情说明](https://www.ricequant.com/doc/rqdata/python/indices-mod)把场内基金列入日线、分钟线和 tick 行情范围；[基金接口说明](https://www.ricequant.com/doc/rqdata/python/fund-mod)明确场外基金不具有该行情能力。因此 `R02.17` 的单一资产候选选为 CN ETF，不延伸到场外基金。
- 官方[通用 `get_price` 合同](https://www.ricequant.com/doc/rqdata/python/generic-api)提供 `frequency='1d'`、显式日期范围、`adjust_type='none'`、`market='cn'` 和 `expect_df=True`；日 Bar 字段包括 `open/high/low/close/volume/total_turnover`，返回身份与日期索引。此处仅选择 `CN ETF × 1d × none` 候选，前复权、后复权和分钟线分别留待独立合同。
- 消费入口选现有 `apps/server/src/market/market-bar-reader-v3.ts` 的 `MarketBarWindowReaderV3`，经既有 Data V3 精确窗口协议消费；不增加平行历史 Bar Consumer。DSA 现有 `data_provider/rqdata_client_factory.py` 和 `thesis_ledger_rqdata_*` 仅完成事件账号初始化、身份映射与隔离读取，`thesis_ledger_provider_runtime.py` 也仅分流 RQData 事件准入；尚无 RQData Bar 库存或生产读取路由。

## 尚未成立的合同与门禁

- 官方通用字段表只写“成交量”“成交额”，未给本候选 ETF 的原生量额单位；不得从股票、HiThink 或 Tushare 字段推导 `fund-unit/CNY`。DSA 后继必须保留未知单位并在必要时拒绝 V3 准入。
- `159516.SZ` 等系统证券身份到 RQData `order_book_id` 的映射，须绑定实际 ETF 合约及场所证据；既有无后缀基金事件查询码合同不能复用为行情身份。
- `none` 只说明请求不复权，仍须通过真实样本核对原始价格、交易日、停牌处理、窗口完整性、来源修订和 `SourcePriceBasis` 的原始量/分红语义。通用接口文档不提供历史版本可见性证明。
- 账号可配置及事件接口权限不证明 `get_price` 权限。后继读取应复用当前凭据修订的读前读后核验，并为 `get_price` 建立有界传输/子进程总期限、精确请求和错误脱敏；现有事件隔离函数不能直接当作 Bar 适配器。

## 状态与后继执行包

`R02.17` 保持未完成：已锁定一个可核验的本地候选，但 `G0-M` 的真实账号权限、身份、单位与覆盖仍缺。`R02.18` 仍不启动生产适配。下一独立叶先核实 `get_price` 对一只已授权 ETF 的身份、日线原生量额单位和 `none` 坐标，记录真实响应范围与权限而不落生产准入；通过后再建立单一 DSA Bar 适配与受控 Reader 合同测试，最后由目标运行态另行验收。该候选不关闭 AC20、M2 价格门禁或严格 PIT。
