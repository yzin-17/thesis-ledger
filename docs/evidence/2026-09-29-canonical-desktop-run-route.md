# 现行回测 Desktop 与 HTTP 入口替换证据

## 改动范围

- Desktop 回测列表、详情、创建、运行、取消、重试统一调用 `/backtests/runs`；SSE 仅将 `mode='V3'` 的摘要写入现行列表缓存。
- 原始价格、前复权、后复权均须先取得带修订戳的现行准备结果；原始价格使用 `raw-events` 记账。移除 Desktop 取 bars 后直传的 V1 排队分支、V2 RunConfig 兜底及相关 mutation、类型和配置构造文件。
- Server `/backtests/runs` 列表只返回完整现行合同；详情和状态操作继续在旧合同上前置拒绝。公开的 `/backtests/jobs*` 控制器路由已删除。
- 旧策略 Schema 的创建与编辑、Server 内部 V1/V2 Worker 分派及其他业务链路尚未删除，本叶不代表全站替换完成。

## 本地验证

- Desktop 定向测试：`strategy.v2.test.tsx`、`strategy.ui.test.tsx`、`backtest-model-disclosure.test.tsx`、`refactor-contract.test.ts`、`backtest-preparation.test.tsx` 共 60 项通过；后续 SSE 修订影响的定向 34 项通过。
- Desktop `typecheck` 通过；`build` 通过，Vite 提示现存大 chunk 警告。
- Desktop 包级测试首次运行 511 项通过、2 项旧断言失败。核对已在途的当前行为后，仅更新对应测试预期：部分结果提示以冻结证据为准，未进入封存与已进入但未通过分别断言；未改写两个在途源码文件。重跑 76 文件、513 项全部通过。
- Server 当前 Run 边界及控制器定向测试 10 项通过；包级测试 1830 项通过、91 项跳过，1 项旧控制器测试调用已删除的 `status` 方法。该测试已改为现行详情路由，相关定向 14 项随后通过。包级测试未因仅测试输入变更而重复运行。

## 尚未完成的门禁

- Server 内部旧 Runner、队列领取与恢复仍可处理旧记录；需在执行面继续清除并作隔离数据库闭环。
- 目标 Server、Worker、DSA 和 Desktop 当前代码未按官方 infra 入口部署；未执行真实 HTTP、客户端 Network/Console 与业务结果验收。
- 本叶不改变多来源回测 Task 的 M1/M2/M3 与 AC01–AC20 勾选状态。
