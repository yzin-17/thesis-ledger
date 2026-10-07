# R06.10 / R06.11 板块归属 Consumer 选择

日期：2026-09-28。范围：只读核对现有行业/概念归属消费链，确定唯一已有 Consumer；不调用 Provider，不新增历史板块平台。

## 现有 Consumer

现有唯一明确的代码→行业/概念归属消费入口是 DSA `src/services/screening/industry.py`：

- `screening.pipeline.enrich_industry_concepts` 将归属字段写入候选快照；
- 可从稳定 CSV/JSON 映射读取；
- 可选 `provider=akshare` 时调用 `fetch_akshare_board_map`；
- AKShare 路径使用 `stock_board_industry_name_em → stock_board_industry_cons_em` 生成行业归属，同时另行处理概念板块；
- 当前 Consumer 只用于研究/筛选 enrichment，没有进入 Server 回测历史事实链。

因此 R06.10 的单一 Consumer 选择固定为 **Screening industry enrichment**，不另建 MarketAnalyzer/Agent 的第二套 membership 存储。

## 当前时间与分类版本边界

Provider cache payload 仅保存：

- schema / provider / max_boards；
- 本机写缓存时的 `created_at`；
- mapping；
- 文件 mtime 用于 TTL。

这些时间是本地抓取/缓存时间，不是来源的板块截面日期或历史有效期。当前代码也没有保存 EastMoney 分类版本、来源发布时刻、板块成分 as-of 或历史变更区间。

因此：

- 可以把当前 provider mapping 视为**当前研究 enrichment 的一次观察**；
- 不能把 cache `created_at` 或 mtime 当作来源 `as_of`；
- 不能把当前成分反填到历史日期；
- 不能据此实现严格历史/PIT 板块归属；
- 在来源给出可审计截面日期/分类版本之前，R06.11 保持 blocked。

## 状态

- R06.10：选择完成（Consumer 与单一 provider 链已确定）。
- R06.11：blocked；缺来源截面日期/分类版本合同，不新增猜测字段或历史 Consumer。
- G0-M / G-M3 / AC20：继续开放。

本叶没有生产源码改动、网络请求或目标部署。
