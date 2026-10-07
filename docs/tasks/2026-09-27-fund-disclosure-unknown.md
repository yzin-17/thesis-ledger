# 基金持仓披露时间任务

对应 [规格](../specs/2026-09-27-fund-disclosure-unknown.md)。

- [x] H0：确认 DSA 将 fetchedAt 写入 disclosureDate，估值服务将其当披露证据。
- [x] H1：Schema 接受明确未知，估值采样保守拒绝；Server 定向 6 项、Schema 全包 330 项、构建、Server 类型与相关 ESLint 通过。
- [x] H2：DSA 保留未知并定向验证，不伪造披露时间；真实转换及 Control 回归 17 项通过。固定 fixture 的已知日期未更改。
- [x] H3：消费端先同步并健康，再同步 DSA；Server/Worker Schema 均验证 null 及旧缓存形态，目标持仓 HTTP 首次 200 并经实际 Server Schema 解析。
- [x] H4：MarketService 缓存保留 86400 秒且读取均经过共享 Schema；抓取/披露时间相等的旧响应投影为未知，覆盖滚动部署，不删除缓存。当前季度来源未提供真实披露时间，独立来源证明仍缺。

部署日志 `/private/tmp/goal-holdings-consumer-sync-20260927.log` 与 `/private/tmp/goal-holdings-dsa-sync-20260927.log` 均成功，镜像不变，新代码在可写层。首轮运行态 Schema 探针路径错误，改用 Node 实际依赖解析路径后 Server/Worker 均通过；不是 Schema 功能失败。

真实探针 `/private/tmp/goal-holdings-api-probe-20260927.py` 首次返回 000001.OF、AKShare、2026-Q2、77 条持仓，disclosureDate=null，实际 Server Schema 接受。凭据只在容器内读取，请求可产生正常健康/预算计数，未修改策略或准入。详细源码摘要及时间见 DSA 持仓证据。本修复不补齐真实披露时间来源，R04 历史可见性门禁继续开放。
