# 研究状态与按需复核的客户端证据

关联：[原 Task 的 T14](../2026-10-18-research-evidence-evolution.md)。沿用现有研究列表、报告详情、比较及新建准备入口。

## 交互

无报告、资料准备与提交待确认、排队/执行、已明确过期/未知、观点或输入变化、复核到期/资料不足分别使用共享中文状态映射。不会仅凭报告年代推断资料过期。准备新研究只打开原准备入口；比较只核对保存版本。

复核区域默认收起。展开只读取已存观察，点击按需按钮才提交指定断言及截止时点。网络响应丢失时保留原提交；收起区域后也按身份、范围、报告和断言保存找回标识。对象、模式或身份变化时关闭旧区域并取消旧请求，权限读取失败不继续展示旧正文。历史版本、固定窗口、原币经济结果、分母和排除原因可单独核对。

## 当前源码验证

| 检查 | 结果及日志 |
| --- | --- |
| 新状态及复核交互、既有比较 | 17 项通过；`/tmp/thesis-ledger-t14-ui-fixed-1792406178.log` |
| 共享 Schema 全量 | 104 文件 1,216 项通过；`/tmp/thesis-ledger-t14-verified-schemas-bounded-1792406518.log` |
| SDK 全量 | 14 文件 98 项通过；`/tmp/thesis-ledger-t14-verified-sdk-1792406532.log` |
| Desktop 全量 | 175 文件 1,003 项通过；`/tmp/thesis-ledger-t14-verified-desktop-1792406535.log` |
| Desktop 构建及类型 | 通过；`/tmp/thesis-ledger-t14-verified-desktop-build-1792406595.log` |
| Server 构建 | 通过；`/tmp/thesis-ledger-t14-verified-server-build-1792406609.log` |
| 修改文件静态及复杂度 | 通过；`/tmp/thesis-ledger-t14-lint-final-1792406472.log` |

默认并发的 Schema 全量检查曾出现两个跨 Python 用例的 5 秒超时。未放宽超时或关闭用例；单文件 10 项复核通过，限制到 2 个 worker 后全量 1,216 项通过。Desktop 全量同样使用 2 个 worker；既有 JSDOM 导航提示没有造成失败。

随后补充收起区域再展开后的同提交找回检查，7 项交互通过：`/tmp/thesis-ledger-t14-gates-ui-reopen-1792407199.log`。`GUARDRAIL_BASE_REF=HEAD` 的文件尺寸 ratchet 通过，8 个遗留超限文件均未增长；边界及现有列表静态检查通过，日志前缀为 `/tmp/thesis-ledger-t14-gates-`。

## 受控浏览器

实际页面组件和项目 Vite 配置配合独立回环接口，使用明示合成报告。鼠标完成展开、一次显式复核、读取两份历史版本及准备入口回调。接口记录为三次 GET、一次观察 POST；临时内存中一个提交和两个版本，没有模型或外部来源请求。窗口未到期与样本不足明确显示，没有生成方向符合比例。

截图：`/tmp/thesis-ledger-t14-browser-review.png`。浏览器页及临时服务器已关闭，自建入口内容核对后全部清理。该证据不替代 G4b 的目标环境完整路径，也不代表日历、经济价格或真实模型资格已经满足。

交付收尾时，当前工作区 Server 类型及构建再次通过：`/tmp/thesis-ledger-final-type-current-1792409080.log`、`/tmp/thesis-ledger-final-build-current-1792409097.log`。三仓差异空白检查通过，暂存项为零，目标运行态未更新。
