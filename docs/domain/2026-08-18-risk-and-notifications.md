# 风控与通知说明

## 责任边界

`RiskRule` 只描述确定性条件，`Rule Evaluation Context` 提供计算所需事实，`RiskEvent` 保存结果，`NotificationDelivery` 负责发送。通知模块和 AI 不得重新计算规则。系统仅用于研究和提醒，不连接券商下单；提醒到达不构成交易执行保证，也不提供实时交易 SLA。后台定时风险评估同批覆盖实际与模拟组合（同一套规则、按模式隔离事件），模拟事件只记录、不发送通知、不进入日报；模拟侧评估失败只记录错误，不影响实际模式监控。

## 规则版本与作用域

规则包含 `version`、`scope`、`condition`、`parameters`、`severity`、`enabled`、`archivedAt` 和 `effectiveAt`。创建、修改、启停、归档、恢复和人工测试均记录 `RiskRuleAudit`；修改、启停、归档和恢复都会递增版本，事件保存触发时的 `ruleVersion`。归档规则写入 `archivedAt` 并保持停用，从规则列表默认隐藏（`includeArchived=true` 可查），扫描永不使用已归档规则；恢复清空 `archivedAt` 后规则保持停用，需手动启用。

- `security` 必须指定 `symbol`，只评估对应证券。
- `account` 必须指定 `accountId`，只评估对应账户。
- `portfolio` 不接受局部目标，使用组合级 Context。

Context 可包含 Quote、Position、Portfolio 历史、Indicators、Chip、Performance、资产分类、收益序列与 `dataQuality`。规则函数不得自行读取数据库或调用 Provider。缺少分母、历史长度不足、筹码日期不一致或无可比数据时返回不可用，不把缺失值当作零，也不产生误报。

## 规则语义

| 类型             | 判定口径                       | 主要边界                     |
| ---------------- | ------------------------------ | ---------------------------- |
| `trailing-stop`  | 当前价相对持有期高点的回撤     | 缺行情时不更新高点           |
| `drawdown`       | 当前净值相对统一序列峰值的回撤 | 空序列或非正峰值不可用       |
| `ma` / `macd`    | 使用当前值及前值确认上穿或下穿 | 相等不算穿越                 |
| `rsi`            | RSI 高于或低于自定义阈值       | 指标由 Indicator Engine 提供 |
| `atr` / `volume` | ATR/价格或成交量/均量超过阈值  | 分母非正时不可用             |
| `chip-peak`      | 价格相对主筹码峰的突破或跌破   | 事件保存筹码版本和计算时间   |
| `chip-ratio`     | 获利比例或集中度超过阈值       | 筹码日期必须与行情日期一致   |
| `chip-migration` | 连续快照主峰的方向和幅度       | 缺少上一快照时不可用         |
| 行业/资产集中度  | 同类资产权重之和               | 返回覆盖率和缺失证券         |
| 高波动暴露       | 高于波动阈值的资产权重之和     | 缺失波动率不视为低风险       |
| 组合相关性       | 有足够历史的收益序列两两相关性 | 常量或短序列不可用           |

筹码分布是基于公开行情与确定性算法的估算，不代表真实账户持仓结构。事件中的 `engineVersion`、`calculatedAt` 和 `marketTime` 用于判断是否可比较，不应夸大精度。

## 通知治理

`info`、`warning`、`error` 和 `critical` 可分别路由到 Provider。未配置专用渠道时使用显式 fallback。静默时段使用 IANA timezone，支持跨午夜；是否允许 `critical` 穿透由策略决定。相同事件和渠道按 cooldown 去重。

可重试错误按 backoff 继续发送，永久错误立即进入 `failed`，每次尝试及最终状态均写入 `NotificationDelivery`。通知排队或发送失败不得回滚已经保存的 `RiskEvent`。低优先级事件可以聚合为日报，但单条事件仍须保留。

运维排查时先查询事件是否已落库，再检查通知状态、`attemptCount`、`errorCode`、`lastError` 与 Provider 配置。Webhook 地址只能通过环境变量提供，不得写入日志、数据库快照或客户端。
