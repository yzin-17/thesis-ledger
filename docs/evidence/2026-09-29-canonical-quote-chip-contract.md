# 报价与筹码合同收敛

## 改动

- ThesisLedger 专属 DSA 报价和筹码 GET 迁到现行 V3 URL，旧 V1 路由删除；最新响应使用 `version: 3`。V1 capabilities 不再宣称这两项能力。
- 主仓共享 Schema 和类型改为 `Quote` / `ChipDistribution` 单一名称，拒绝旧响应版本。Server 直接校验上游版本和代码，不补写 Provider、代码或版本；报价与筹码缓存键隔离旧值。
- Desktop 行情详情消费类型、Server 测试夹具、DSA 合同文档和 Changelog 已同步。DSA 合同测试明确验证旧 URL 返回 404。

## 本地验证

- 首次 DSA 官方离线门禁 7596 项通过、5 项失败，失败测试仍挂载旧 V1 报价 Router。修正测试挂载后，两文件定向 27 项通过；再次单独运行官方离线门禁 7601 项通过、1 项跳过、4 项按配置未选。
- Schemas 全包 562 项、Server 全包 1687 项且 81 项跳过、Desktop 全包 508 项通过。Server/Desktop 类型检查与构建、DSA syntax/flake8 关键检查、主仓模块边界检查通过。
- 旧报价/筹码公开类型、Schema 与业务调用 URL 反查为零；`git diff --check` 通过。

## 保留门禁

目标 DSA/Server/Worker 尚未同步，真实报价和筹码来源、浏览器/桌面 UI 与 Network 未重新验收。基金持仓、FX、Backtest、Ledger 和其他旧合同仍需替换。旧数据库数据的开发重建与目标 Schema head 仍为独立部署门禁。
