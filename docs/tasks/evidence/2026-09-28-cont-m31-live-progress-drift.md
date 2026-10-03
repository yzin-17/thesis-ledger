# M31：HiThink 分红真实进度字段与公开合同差异

## 只读探针

- 2026-09-28 13:04:38 UTC 与 13:05:29 UTC，宿主机从用户指定的 `~/.zshrc` 环境变量读取 Key，仅调用 `GET /api/fund/corporate-actions/dividends?thscode=510300.SH`。未记录 Key、请求头或原始整表；第二次是对字段类型的唯一复核请求。
- 新有界读取器两次均成功：14 条，`dividend_count` 与条数相等；响应 SHA-256 分别为 `242c77027f3f287a0d85f05ff090b5a7f6a5ad97f51e4eba220ba9c5cb890fee` 与 `864338a86d326138aea32a49674c925984da20b1ba9ea3b0188df08cd043780b`。服务端 `timestamp` 随请求变化；这两个摘要不应用作内容修订结论。
- 14 条的 `progress` 均为字符串 `"2"`。除息日为 2025-06-18 的一条，其税前/税后金额均为 `0.88` 元/10 份，公告、登记、除息、发放毫秒日期分别对应 2025-06-11、06-17、06-18、06-27；与此前核对的[基金管理人公告](https://www.sse.com.cn/disclosure/fund/announcement/c/new/2025-06-11/510300_20250611_ZAU4.pdf)吻合。

## 合同差异与决策

- [HiThink 官方端点文档](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/corporate-actions-dividends.md)把 `progress` 标为字符串，示例值是 `"实施"`；没有列出 `"2"` 的枚举含义。本次单只基金的已发生事件可核对，仍不足以把所有 `"2"` 记录和未来标的自动定义为已实施。
- `normalize_hithink_fund_dividends` 已增加未知进度失败关闭；`"2"` 不会被静默当作无事件。新增真实字段反例后，M31-a 的离线测试通过，但实际生产字段映射尚未完成，原勾选撤回。不得据此接入事件 V3 或签发完整覆盖。
- M31-b1 的真实单次传输成功不证明历史全量、分页上限、权限长期有效或公告历史可见性；M31-b2 仍未开始。HiThink 价格量额单位和 `159516.SZ` 普通回测门禁不受本探针影响。

## 验证

- DSA `tests/test_hithink_fund_dividend_reader.py`、`tests/test_hithink_fund_dividends.py` 及相邻东财/Tushare 分红：77 passed；限定 flake8 通过。
- 同端点请求预算本轮已使用两次；在取得可信进度码字典或等价独立证据前不重复探针。

## 后续复核（2026-09-28 15:13 UTC）

- 在首条真实回测镜像更新后又执行了两次相同端点只读探针，超出了上节自定的同前提请求预算。两次仍为 14 条、条数传输核对通过、`historyComplete=false`，`progress` 仍全为字符串 `"2"`；响应 SHA-256 分别为 `24820c9d1feeac0a969b516b896f094638036ae2c0fba563cdb24f3ed6324b6f`、`c30353912a12f8abebb14b27dd74679769b0351f39870cd309c70441760708e6`。其中第二次按除息日过滤 `2025-07-01..07-31` 为 0 条，结合[公开无事件窗口核查](2026-09-28-cont-g0-h-510300-no-event-window.md)只提供局部一致性，不证明来源历史全量。
- 再查 [HiThink 官方基金端点说明](https://github.com/HiThink-Tech/Financial-API/blob/main/skills/hithink-finance/references/api/endpoints-fund.md)与[分红端点文档](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/corporate-actions-dividends.md)，均只列 `progress` 字段而未给出 `"2"` 的枚举释义。M31-a 保持未通过，生产标准化继续对未知进度失败关闭；不再按相同前提重复请求。

## 后续公开资料复核（2026-09-29）

- 再查 [官方 API 页面](https://fuyao.aicubes.cn/docs/api-reference/fund-corporate-actions/)和[官方端点索引](https://github.com/HiThink-Tech/Financial-API/blob/main/skills/hithink-finance/references/api/endpoints-fund.md)：页面仍只说明 `progress` 是字符串“分红进度”，示例为 `"实施"`，没有 `"2"` 的码字典。公开页面现列 `fund_type` 为必需参数，而 2026-09-28 两次目标响应在只传 `thscode` 时成功；这属于文档与实测请求合同差异，不能据此推定以后继续接受省略参数。该次公开资料复核没有调用带凭据端点，也没有改变生产映射或准入。

## 显式基金类型对照（2026-09-29）

为排除省略 `fund_type` 导致数字进度码的可能，仅新增一次 `fund_type=exchange&thscode=510300.SH` 的只读请求。HTTP 200、业务 `code=0`，`dividend_count=14` 与实际 14 条一致；14 条 `progress` 仍全部为字符串 `"2"`。响应原字节 SHA-256 为 `982fbd399600bf3a9dd39d317c2b8cafc9a29cb938fb6bde726801133e29f742`；响应含动态 `timestamp`，不与先前摘要直接推断内容修订。探针只输出状态、字段名、条数、进度分布和摘要，未保存 Key、请求头或整表。显式基金类型消除了一个请求参数疑点，但没有给出数字码含义或历史覆盖；M31-a 与真实事件准入继续开放，不再按相同前提重复请求。
