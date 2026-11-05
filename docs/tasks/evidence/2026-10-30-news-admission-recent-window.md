# 同花顺新闻七日窗口滚动验收

日期：2026-10-30。所属[规格](../../specs/2026-10-30-news-admission-recent-window.md)，承接研究工作台的实际来源前置。本证据仅关闭单源续验，不代收模型生成、引用验证或在途重启。

用户明确授权原同花顺 `hithink-news-stock-timeline`、600519.SH、2026-10-23～10-30 元数据，先实读最多一页十条，再续验一小时；其他来源、路由、凭据及默认保持。

## 实现与离线验证

原续验入口继续拒绝原范围以外的日期。新增 `--roll-recent-window`，仅与同花顺的 `--renew-existing`、一小时、旧版本及摘要同时使用；旧范围必须恰为七日，开始和结束同时向前一天。新选项不允许任意扩展或跳过多日。证据保留显式滚动选择与完整旧记录链。

CLI 与 SQLite 新正例先失败，实施后 Node 12 项、SQLite 续验 7 项、旧日期扩展 6 项、原元数据/入口解析 12 项全部通过，共 37 项、无跳过。Node 两文件及 Python 四文件语法检查通过。实际工作程序验证了新字段为可选，原默认续验的参数集合继续兼容。未安装 Ruff，不将语法检查记成完整 Python lint。依赖及锁文件未修改。

## 目标操作与结果

2026-10-30 23:35:56（北京时间）在目标 DSA 内用原凭据只实读一页，HTTP 200、10 条；无重试、无翻页，只保存标题、链接、发布时间和来源等元数据，凭据不输出。元数据证据摘要为 `6de2411bffc75b058a0ad809b1aab2f640911c036e92e4a96e6934bfc9845224`。

随后通过维护入口 `scripts/nvidia-news-admission.mjs` 依次执行默认计划、`--apply` 和只读 `--verify`。精确确认旧版本 3 及摘要 `70f166d082c900a62ba1df6278b3a9d0641b554c00818ed84a792a1c2ec96499`；单次 CAS 成功为版本 4，日期为 2026-10-23～10-30，有效期截至 **2026-10-31 00:36:39（北京时间）**。新证据摘要为 `3394996c4eab4f57285ea82eb5c88aa5164c1966d1e4fcbfeddabfee035b8f1e`；只读反读通过。

保护对账确认：仅指定的一条准入改变，其余八条逐记录摘要保持；政策历史 174 条、当前政策及九份 Provider 配置整表摘要保持。原十份证据逐文件摘要保持，只新增一份证据。没有改变来源启停、路由、认证或容器运行态，没有模型调用。该一小时到期后不自动续验。

## 执行证据

执行包：`.recovery-artifacts/first-four-acceptance-20261030T134208Z/`。包含 `news-roll-before/`、新用例首次失败日志、`news-roll-checks.json`、`news-roll-python-syntax.json`、`news-source-once-dispatch.json`、`news-source-validation.json`、`news-roll-command.json`、计划/应用/反读回执及 `news-roll-protection.json`。

后续研究样本另有独立提交、模型预算及 trace；本次来源续验不把历史或新模型失败记成业务通过。
