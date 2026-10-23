# 基金估算误差的有限基准预案

接续[复权 Task P6](../2026-10-21-fund-adjusted-returns.md)及[Spec 的当前可得测量](../../specs/2026-10-21-fund-adjusted-returns.md)。沿用户已给出的全部验收授权直接执行，不新增账户或启用产品入口。

- 冻结案例：`e8dfd8cc-62ef-4709-a4b4-d68dbda67688`；计划 `.recovery-artifacts/fund-error-20261021-plan.json`，SHA-256 `913ccd729d8a1b33e19085d0958cdaae52f0de037ffd02504432f3f1eb835697`。
- 复用已通过的复权案例回执，SHA-256 `faee0f14fa00af610a5cff273c2e122dc35b84683c2d23733a4c391a4dd56138`；74 项披露、20 份实际报价/qfq 序列及 10-20 NAV 保留原时刻和指纹，不请求它们的来源。
- 政策 160 原 16 条路由缺少 `FUND_NAV_HISTORY`；只临时追加现有已启用、已配置的 `efinance/eastmoney` 一条绑定，不改变其余选择、开关或凭据。预计 160→161→162，成功或失败均恢复原内容；并行变化停止覆盖。
- 精确一次 Server GET：`/api/market/161725.OF/fund-nav/history?start=2026-10-19&end=2026-10-19&limit=1`，请求前持久记录预算，原响应先落盘；不自动重试来源。
- 在目标实际编译 helper 和估值公式中，用 10-19 NAV、已冻结 qfq 的 19/20 日点及原披露比例计算 10-20 基准值，对照已知正式值。校验每份序列 canonical fingerprint、日期、权重和价格口径，保留逐项计算及绝对/相对误差。
- 测量时点是当前；结果是当前已知输入下的保留观察基准，不回填历史分钟、日级修订、Ledger 或账户，不宣称历史 PIT 或曾在过去实盘运行。没有自行设定通过误差阈值。
- 允许该基金正常 NAV 缓存增加 10-19 点，原十一账户、六个分钟点、日级修订、13 张业务/AI 配置表、57 份 V3 结果及模型计数保持。真实模型零请求，DG3 TODO，Web 范围保持。
- 维护入口默认只读，执行用 `scripts/fund-error-benchmark.mjs --execute <计划> --authorized-fund-error-benchmark`；仅恢复用 `--recover <回执>`，不补发来源。5 项计划、预算输入及恢复边界测试与运行脚本语法/格式通过。
