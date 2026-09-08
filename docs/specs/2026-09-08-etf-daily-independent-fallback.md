# ETF 日线独立备用源 Spec

## 背景与问题

ThesisLedger 的 `DAILY_BAR + ETF` 按 `akshare -> efinance` 路由，但 2026-09-08 的运行证据显示，两者的 ETF 日线实现最终都请求东方财富历史 K 线端点。该端点对 `510300.SH` 持续主动断开连接后，两级 Provider 都失败，Data Contract 返回 `503`。实时行情及普通 A 股日线仍可用，故障集中在 ETF 日线的单一上游依赖。

DSA 已有不经过东方财富、支持沪深 ETF 和指定日期范围的腾讯前复权日线能力，可以作为 AkShare Provider 内部的独立备用通道。Provider 适配器实现仍由 `daily-stock-analysis` 仓库维护；本 Spec 只定义 ThesisLedger 消费侧可观察行为和跨仓验收边界。

## 目标

- ETF 日线继续优先使用现有主通道。
- 主通道抛错或返回空结果时，自动尝试不依赖东方财富的前复权日线通道。
- 保持 ThesisLedger Data Contract、Provider Policy、字段结构和跨 Provider fallback 语义不变。
- 通过确定性测试和真实容器请求证明故障路径可恢复。

## 非目标

- 不调整 `akshare -> efinance` 的 Effective Policy 顺序或 revision。
- 不新增 Provider、配置项、数据库字段或 API 字段。
- 不把 Cookie、NID 补丁或重试次数作为本次恢复的必要条件。
- 不改变普通 A 股、港股、美股、场外基金或实时行情路由。
- 不把 Provider 内部上游通道暴露为新的 Contract Provider。

## 现状与约束

- Bars V1 当前只支持 `1d`，返回现有标准 OHLCV、来源和 freshness 字段。
- ETF 日线现有口径为前复权，备用通道必须保持相同复权请求语义。
- AkShare Provider 是 Contract 的适配器边界；适配器内部通道切换通过 DSA 日志可观察，不改变对外 `provider=akshare`。
- 主仓只维护产品 API、跨仓兼容和验收标准；Provider-specific 实现、日志和确定性测试归 DSA 仓库所有。

## 设计方案

DSA 的 AkShare ETF 日线使用两级内部通道：先请求现有主通道；主通道抛错或返回空结果后，记录失败来源和原因，再请求腾讯前复权日线。任一通道返回非空标准数据即结束；两条通道均不可用时，保留明确失败并交由既有跨 Provider fallback 继续处理。

内部通道切换不设置 Contract 的 `fallbackUsed=true`。该字段继续只表示 Effective Policy 中的跨 Provider fallback；实际内部上游通道由 DSA 日志确认，避免静默降级。

## 对外行为或接口变化

请求、响应 Schema 和状态码约定不变。可观察行为变化仅为：当 ETF 日线主通道不可用而腾讯通道可用时，原先的 `503` 改为成功返回 `provider=akshare` 的日线序列。

## 数据、状态或兼容性影响

- 不新增持久化状态或迁移。
- 不改变缓存键、Provider ID、Policy revision 或认证方式。
- 备用通道使用前复权参数和现有标准化流程，不混合不同来源的字段。
- 主通道成功时不额外发起备用请求。

## 测试策略

### 关键可观察行为

- 主通道成功时不调用备用通道。
- 主通道抛错或返回空表时调用备用通道，并返回标准化 ETF 日线。
- 两条通道都失败时仍返回稳定失败，不返回空成功。
- 真实沪市和深市 ETF 能经 ThesisLedger facade 取得目标日期范围内的数据。

### 优先测试层级

1. DSA 现有 ETF 日线路由测试中的确定性回归。
2. 受影响 Python 文件的编译检查和 Provider runtime 回归。
3. 重建并仅重建 DSA 容器后，通过 ThesisLedger facade 发起真实 Bars 请求。

### 关键边界与回归场景

- 沪市与深市 ETF 代码转换。
- 主通道异常、空结果与成功三种分支。
- 备用通道失败时不得把空表伪装为成功。
- 普通 A 股已有路由不受影响。

## 风险与备选方案

- 腾讯接口仍是免费第三方接口，未来也可能限流；多条上游同时不可用时最终仍可能返回 `503`。
- 不同上游的复权因子更新时间可能短暂不同；本方案统一请求前复权并沿用现有标准化校验，避免主动混合字段。
- 可选 Cookie 和 NID 补丁仍可作为东财增强能力，但已验证不能单独解决当前断连，不作为本次验收条件。
- 若备用通道未来不再覆盖 ETF，应新增真正独立的 Contract Provider，而不是继续堆叠同源别名。

## 未决问题

### Blocking

无。

### Non-blocking

无。

## 验收标准

- AC1：ETF 日线主通道抛错或返回空结果时，AkShare 自动使用独立的腾讯前复权日线并返回非空标准数据。
- AC2：主通道成功时保持原路径且不调用备用通道；两条通道均失败时保留明确失败，不返回伪造或空成功。
- AC3：ThesisLedger Bars API、Provider ID、Policy 顺序、响应字段和跨 Provider `fallbackUsed` 语义保持不变。
- AC4：确定性回归测试通过，DSA 中英文使用说明和 Changelog 已同步，并完成真实 ETF facade 请求验收。
