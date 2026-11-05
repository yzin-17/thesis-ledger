# DSA 来源身份与净值准入收敛

## 变更

- 删除来源别名身份、健康行兼容读取和请求预算旧键兼容模块。健康状态、熔断键与持久请求预算现在只按当前策略选出的精确 `providerId / capability / instrumentType / upstreamSource` 身份读写；旧 SQLite 键不再参与当前请求。
- 删除 Provider Runtime 的旧 tuple 便捷接口；内部测试改为直接使用 `ThesisLedgerDataRequest` 与 `ProviderExecution`。旧 V1/V2 策略并存测试已删除，因为当前 Store 不再提供这两类策略。
- `FUND_NAV` 与 `FUND_NAV_HISTORY` 先校验上游完整序列，再分别选最新点或按请求窗口/条数截取；返回前按实际行日期复核来源准入。上游无法安全截取时拒绝，防止准入范围外的净值行进入 Gateway。
- DSA 契约文档已更新当前精确来源键、净值返回日期门禁和 Control 策略说明，移除仍声称 V1 wire 兼容的旧段落。

## 本地验证

- 先前全量 DSA 离线测试：`7521 passed, 1 failed, 1 skipped, 4 deselected`；唯一失败项是已删除的 V1/V2 策略并存断言。该次门禁按失败记录。
- 来源身份与请求预算定向：`50 passed`。移除旧 tuple 接口后的定向：`54 passed`。净值日期准入定向：`42 passed`。相关文件 `flake8` 通过。
- 删除来源别名、旧 tuple 接口及增加净值返回日期门禁后的 DSA 全量离线测试：`7522 passed, 1 skipped, 4 deselected`。此后删除了结果对象的 V2 条件投影和两个无生产调用的属性别名，相关 Gateway/Runtime 定向 `37 passed`、`flake8` 通过；最终再次运行 DSA 全量离线测试：`7522 passed, 1 skipped, 4 deselected`。
- 补充净值窗口截取后，当前数据路由、净值日期、Runtime、Gateway 定向 `51 passed`，相关文件 `flake8` 通过；最终 DSA 全量离线测试 `7524 passed, 1 skipped, 4 deselected`。

## 尚未验收

目标 DSA SQLite、Server→DSA HTTP、Docker 容器和真实历史净值来源仍未验证。旧数据读取兼容按用户决策移除；实际开发库若需重建，须走 `AGENTS.md` 规定的显式入口、目标核对与消费者停止流程。E04、D01–D03 继续保留未勾选。
