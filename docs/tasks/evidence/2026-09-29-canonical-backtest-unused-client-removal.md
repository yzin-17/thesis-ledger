# 回测旧 DSA 客户端方法清理

## 源码核对与改动

- 全仓调用反查确认 `DsaClient.backtestBars()`、`backtestCapabilities()`、`backtestCorporateActions()` 已无生产调用；当前 Snapshot 通过精确 V3 日线与事件读取，公司行动测试夹具中对旧方法“不调用”的断言不再有意义。
- 删除上述三项 Server 客户端方法、对应导入、旧公司行动 mock 与冗余断言；保留当前仍在使用的 `backtestCalendar()` 和 `backtestInstrumentFacts()`。
- DSA 的旧 V2 路由及 Schema 仍存在，且当前 Snapshot 把 V3 事件投影为 V2 公司行动 envelope；这些路径尚未收敛，不能以客户端方法删除宣布整个回测合同完成。早期证据把“DsaClient 存在方法”推断为“当前 Server 必会调用”并不准确，以本轮调用反查为准。

## 本地验证

- Server 类型检查通过；Backtest 定向 4 个文件、30 项通过。
- 目标 Worker、DSA 路由、持久化快照及完整 Server 包级门禁未因本叶单独重验。
