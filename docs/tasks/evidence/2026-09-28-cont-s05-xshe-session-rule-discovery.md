# XSHE 交易时段规则版本发现卡点

为承接 2026 年休市原文解析，尝试读取深交所[交易规则（2026 年修订）发布页](https://www.szse.cn/lawrules/rule/trade/t20260424_620190.html)，核对精确施行日期及目标窗口前段适用的规则版本。网页工具先打开 `investor.szse.cn` 官方页面，随后仅一次改用 `www.szse.cn` 对应官方路径重试，两次均返回获取超时。未取得发布页原字节或施行条款；本轮停止请求，不以搜索摘录或规则 PDF 的时段文字推断其覆盖 2026 年全部历史决策日。

已知[规则 PDF](https://docs.static.szse.cn/www/lawrules/rule/trade/current/W020260424690713155663.pdf)包含竞价时段文本，但缺可核验的版本生效边界及本轮固定原字节。`CONT-S05-XSHE-session-rule-discovery` 记为 `skipped_after_retry`；年度休市解析器维持独立事实层，不生成完整日历、历史可见时点或 PIT 资格。真实目标与 Provider 未触及。
