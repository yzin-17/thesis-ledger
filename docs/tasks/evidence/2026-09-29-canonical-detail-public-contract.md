# 公开行情详情合同收敛

## 改动

- 将公开 `Market Detail` 响应直接改为唯一现行 `MarketDetailResponse` 与 `marketDetailResponseSchema`，响应 `contractVersion` 为 `3`；Server、API Client 和 Desktop 同步消费。旧 `MarketDetailResponseV2`、`MarketDetailSectionV2` 与旧解析器不再导出。
- 详情分段复用现有 `MarketDetailSection` 类型，删除重复类型。日线序列仍使用其独立的当前合同，不能把详情响应版本误当作日线序列版本。
- 更新详情测试夹具，并加入拒绝旧详情响应版本的断言。

## 本地验证

- Schemas 全包测试：562 项通过；构建通过。新增拒绝断言后将单独运行对应定向测试。
- API Client：36 项通过，构建通过。
- Server：1686 项通过，81 项跳过；类型检查通过。
- Desktop：508 项通过；类型检查通过。
- `git diff --check` 通过。旧详情类型/解析器引用反查为零。

## 保留门禁

当前日线序列自身的 V2 编号、其他 Market/Backtest/Ledger V1/V2 路径、目标 Docker 与真实 Provider 验收均未收敛。以上本地测试不构成目标运行态或 AC01–AC20 通过。
