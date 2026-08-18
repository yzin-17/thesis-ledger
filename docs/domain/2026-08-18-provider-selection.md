# 数据源选择与专业 Provider

## 选择原则

免费 DSA 适合开发、低频行情和个人研究；本地 Provider Registry 按能力、优先级和健康状态自动 fallback。专业 Provider 适合更长分钟历史、财务与公告覆盖和更严格的 PIT 回测，但需要单独确认授权、额度和成本。

当前插件边界提供 Tushare 兼容实现和第二个 JQData 兼容实现，二者都只实现统一的 Quote/Bar/Health Contract；核心 Market Service 不直接依赖供应商 SDK。Provider 配置保存能力、优先级、settings、credentialsRef、quota 和 cost，凭证只保存加密引用或加密字节，页面不回显密钥。

## 能力与时序

Quote、日线、分钟线、Financial、Announcement 可分别路由，缺失能力会沿优先级 fallback。Financial 记录 `publishedAt` 和 `availableAt`；回测和 AI 只能读取决策时点已经可用的记录，不能用“最新财务”覆盖 PIT 语义。分钟历史回填仍需经过 MarketBar 落库、completeness 和 freshness 检查。

## 额度与验证

配置保存前校验 provider 名称、优先级和能力；连通性测试返回 credential 是否已配置和可解释状态。Quota 显示 used、limit、remaining、重置时间及 `ok`/`warning`/`exhausted`/`unknown` 状态。升级供应商 SDK 时必须运行同一套 Quote、Bar、PIT 和健康 Contract Test；未知授权或额度状态默认标记 `unknown`，不会静默切换到昂贵源。
