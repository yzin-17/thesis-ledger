# M31-a：HiThink 基金分红离线标准化

> 后续真实探针修订：本文件只证明官方示例形态的离线映射；真实 `progress="2"` 与示例不一致，M31-a 已撤回完成标记，详情见[真实字段差异](2026-09-28-cont-m31-live-progress-drift.md)。

## 输入与范围

- 字段依据：[HiThink 官方基金分红端点](https://github.com/HiThink-Tech/Financial-API/blob/main/docs/api/fund/corporate-actions-dividends.md)。`thscode` 带市场后缀；接口 `item[]` 金额为每 10 份税前/税后现金，七类日期为 Unix 毫秒，`progress="实施"` 是官方示例中的已实施记录。
- 本叶只处理端点 `item[]` 的固定样本。DSA 新增 `data_provider/hithink_fund_dividends.py` 和 `tests/test_hithink_fund_dividends.py`；不读取凭据、不请求网络、不写准入或冻结仓库。
- 调用方必须提供已核验的基金身份、币种、观测时间和来源修订；标准化器不能自行授予这些事实。

## 结果

- `0.88` 元/10 份标准化为 `0.088` 元/份；税后金额仅保留于观测记录，事件事实取税前金额。公告、登记、除息、派息、再投资、收益基准和其他分红日期分别保留；除息日是经济生效日，抓取时刻是 `availableAt`。
- 已实施记录缺少除息日或税前金额、日期顺序冲突、无效毫秒时间戳、非正或非有限税前金额、同除息日内容或进度冲突均拒绝。空响应、窗外记录和未实施进度不产生事实；`coverage.complete=false`。
- 官方文档仅给公告日期，没有逐版本历史可见时间；不生成 `strategyVisibility`，不据此推断历史 PIT 或完整事件覆盖。

## 验证与边界

- DSA `.venv/bin/python -m pytest -q tests/test_hithink_fund_dividends.py tests/test_eastmoney_fund_dividends.py tests/test_tushare_fund_dividends.py`：60 passed，其中新例 15 项。
- DSA `.venv/bin/python -m flake8 data_provider/hithink_fund_dividends.py tests/test_hithink_fund_dividends.py`：通过。
- DSA `git diff --check`：通过。新增文件为未跟踪状态，此检查不覆盖其内容；新增文件另按定向 lint 和测试核验。
- M31-b、G0-H、G-M2-Events 保持开放：尚缺端点有界读取、目标身份/币种、真实账号权限、历史完整覆盖、准入与冻结消费，以及目标运行态。`159516.SZ` HiThink 精确价格路由仍未准入，本叶不改变普通回测门禁。

上段为本文件初次记录时的状态。随后 M31-b1 有界读取已完成；真实进度码差异使 M31-a 重新开放。
