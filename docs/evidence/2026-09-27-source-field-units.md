# 来源字段单位消费契约

## 当前实现

M21-b 先完成消费者部分：`sourcePriceBasis` 与解析后的价格事实可携带 `fieldUnits`，成交量为 hand/share/fund-unit/unknown，成交额为 CNY/unknown。旧输入缺省时不补字段，不把量的复权性质 `volumeBasis` 与数值单位混为一谈。

Server 行情序列及视图缓存身份纳入显式 fieldUnits；旧无字段描述的序列编码保持原结构，相同数值但不同单位的输入不共享版本。基准兼容描述对已验证价格事实做 JSON 规范化，移除可选 undefined 表示，保留明确单位；该步骤没有改变数值或转换假设。

## 验证

- Schema 定向 6 项、完整 37 文件 329 项通过，Schema build 通过。
- Server 序列身份 5 项与 V3 Benchmark 9 项，合计 14 项通过。
- 受影响 Schema/Server 文件定向 ESLint 通过。
- 类型检查首次发现基准兼容 JSON 值不能包含可选 undefined，已在兼容投影边界规范化；最终 Server 类型检查通过。

## DSA 生产者接线

完整窗口和交互图表复用 `api/thesis_ledger_source_basis.py` 校验并投影原生元数据。显式契约必须匹配 AKShare/EastMoney、CN 日线、资产类型、复权参数、端点、独立来源与未换算标记；错配返回 `invalid_response`，缺省契约继续省略单位字段。股票保留手/元，ETF 保留 unknown，不进行数值换算。

指纹在存在字段单位时追加带名称的单位描述，旧无字段输入保持原编码；来源 revision 同步绑定该指纹。价格事实构造也由两类响应复用，既有大 API 文件净减少行数。

验证命令：在 DSA 执行 `.venv/bin/python -m pytest tests/test_thesis_ledger_field_units.py tests/test_thesis_ledger_market_v3.py tests/test_thesis_ledger_chart_v3.py -q --tb=short --disable-warnings`，54 项通过。新增 19 项覆盖两个资产的三口径、11 类元数据篡改、两类响应保留原值及指纹变化。首次测试调用错误使用了位置参数，修正为实际函数的关键字参数后通过。受影响四个 Python 文件 `py_compile` 通过。

## 剩余工作

Server 新增 `test/backtest/v3-field-units-snapshot.test.ts`，通过真实 DsaSnapshotBuilder、LocalSnapshotStore 和 Parquet 写入构建完整快照，再用新 Store 离线读回各来源证据行并检查单位；使用两个新的 V3 Runner 执行并比较完整结果一致。Reader、日历和标的事实来自明确合成 fixture；冻结后将这些读取入口设为离线错误。完整响应哈希在单位出现后改变，JSON 往返后保持一致。该项最终通过，已有完整快照 5 项与序列身份 5 项也通过；新增文件 ESLint 通过。测试配置经历旧 Runner 和占位策略哈希两处修正，未改变产品验证规则。

M21-b 本地契约、生产者和冻结消费闭环完成。DSA 与 Server 源码尚未部署，真实来源及目标运行时仍需验收；该离线证据不替代 PostgreSQL JSONB 路径，既有 I01 哈希卡点保持原跳过记录。

新增冻结测试后，`pnpm --filter @thesis-ledger/server typecheck` 通过。

运行时接线补验：扩展 DSA 既有真实 SQLite Control Store → Provider Runtime → HTTP 窗口用例，分别验证缺省、正确与资产错配的原生元数据。完整窗口回归 22 项通过；适配器为合成来源，运行时不替换。正确单位保留到响应，错配返回 502/invalid_response，缺省维持省略字段。没有用这一离线测试声称真实 Provider 验收。

该变更对新消费者保留旧输入兼容；旧严格消费者会拒绝新字段，因此目标部署必须先更新消费者再启用生产者，不能单独发布 DSA 并声称兼容。此轮没有部署。M21 父项保持开放，ETF 单位及真实来源准入另验。
