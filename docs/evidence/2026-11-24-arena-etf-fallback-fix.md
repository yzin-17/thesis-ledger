# ETF 历史执行回退与研究错误收敛

日期：2026-11-24。归属：[R4H4](../tasks/2026-11-12-arena-replay-live.md)、[Spec AC22](../specs/2026-11-12-arena-replay-live.md#ac22etf-执行回退与研究错误边界)。接续[第 3 次请求排查](2026-11-24-arena-request3-diagnosis.md)。本批仅本地源码、现有样本与文档；未调用模型、行情来源或真实数据库，未重试比赛、部署、重启、提交或推送。

## 实现结果

`market-arena-replay-reader.ts` 将执行证据读取交给 Market 内的 `market-arena-replay-execution.ts`，价格、账户、结算与撮合语义保持原样。原读取器从 416 行缩至 364 行，避免继续扩大现有职责。

- ETF 取得既有历史执行快照时正常消费，不读取股票状态组合。
- ETF 快照失败或未提供读取端口时，返回 `replay_rules_unavailable`，不再构造仅支持 STOCK 的状态查询，也不追加身份回退请求。来源失败的原异常保留为内部 `cause`。不改变共享状态合同、DSA 能力、来源配置或 ETF 归档准入。
- 股票继续按现有行为回退到身份资料及合法的 `DAILY_TRADING_STATUS` 查询；估值仍不依赖执行资格。
- 历史研究报价保留已取得的价格，将执行失败独立投影为 unavailable。仅允许既定业务原因码，其他异常统一为 `replay_rules_unavailable`，不将 Schema、HTTP 或任意内部异常正文传给模型。

新增便携测试 `apps/server/test/market/arena-replay-etf-fallback.test.ts` 复用既有 `arena-sampled-frozen-business.json` 的日历、分钟、ETF 快照和原业务闭环输入；股票回退使用明确的受控身份与状态合同样例，不冒充新的真实股票来源验收。两个失败反例分别覆盖原请求中的 `588000.SH`、`512480.SH`。本批没有改变原测试样本或失败审计。

本轮完整写集：

- 源码与测试：`apps/server/src/market/market-arena-replay-reader.ts`、`apps/server/src/market/market-arena-replay-execution.ts`、`apps/server/test/market/arena-replay-etf-fallback.test.ts`。
- 文档：`docs/specs/2026-11-12-arena-replay-live.md`、`docs/tasks/2026-11-12-arena-replay-live.md`、`docs/tasks/2026-11-12-autonomous-model-arena.md`、本证据，以及 `docs/evidence/2026-11-24-arena-request3-diagnosis.md` 的后续状态指针。
- 忽略目录：私有基线、检查命令／日志、原冻结错误投影及本轮摘要，均位于 `.recovery-artifacts/arena-etf-fallback-fix-20261124/`。

## 定向验证

宿主执行目录 `/Users/yzin/code/thesis-ledger-workspace/thesis-ledger`，Node.js 24.22.2。pnpm／Corepack registry 均使用 `https://registry.npmmirror.com`，没有安装依赖。完整命令、退出码及输出保存于私有 `.recovery-artifacts/arena-etf-fallback-fix-20261124/` 的 `*.command.json`、`*.log`。

```sh
pnpm --filter @thesis-ledger/server exec vitest run \
  test/market/arena-replay-etf-fallback.test.ts \
  test/market/arena-replay-reader.test.ts \
  test/market/sampled-frozen-business.test.ts \
  test/market/sampled-execution-business.test.ts
```

4 文件、23 项通过，退出 0，其中新增 9 项覆盖 ETF 成功、两证券快照错误、缺失端口、纯估值、股票成功回退、Error／非 Error 异常及已知业务原因保留。测试期间全局 fetch 被禁止；没有装配真实数据库或模型端口。既有冻结样本的提交、成交、费用、现金、净值、T+1、重复处理和止损到期闭环继续通过。

首次局部运行因提取代码时漏保留读取器 `newId` 使用的 `randomUUID` import 而失败；恢复该 import 后局部 14 项通过，补齐第二证券反例及相关回归后以上 23 项全部通过。没有重跑任何真实比赛或模型请求。

另直接读取第 3 次模型请求原冻结工具消息，调用本次正式的原因投影函数，仅生成离线副本：

```sh
pnpm --filter @thesis-ledger/server exec tsx \
  ../../.recovery-artifacts/arena-etf-fallback-fix-20261124/verify-frozen.mts
```

退出 0，`frozen-error-projection.json` 显示两笔原错误各从 3,215 字符缩至 24 字符的原因码；整段工具消息从 10,532 缩至 3,314 字符。两笔价格与其他工具结果保持，原 `invalid_union` 不再出现在副本，原冻结审计字节不变。网络尝试、真实模型调用及数据库操作均为 0。这是错误投影验证，不是重新运行该轮研究，也不证明模型将如何回复。

## 静态检查与构建

以下检查均针对当前本地工作区，全部退出 0；边界、依赖图及文件尺寸无告警。具体回执由私有目录持有：

```sh
pnpm --filter @thesis-ledger/server typecheck
pnpm --filter @thesis-ledger/server build
pnpm exec eslint apps/server/src/market/market-arena-replay-reader.ts \
  apps/server/src/market/market-arena-replay-execution.ts \
  apps/server/test/market/arena-replay-etf-fallback.test.ts
node scripts/check-boundaries.mjs
node scripts/check-workspace-dependencies.mjs
node scripts/check-file-size-guardrails.mjs
```

## 一致性结论

本轮统一一致性审查通过：AC22 与源码、23 项检查、冻结错误投影、Task 和写集已对账；仍有效的原 G02／G04、采样政策和准入证据继续复用。AC22 的本地修复、冻结样本与模型可见错误边界通过；ETF 缺少已准入执行快照时仍准确不可用，没有通过放宽门槛伪造成功。股票合法回退与已有业务闭环保持。

目标运行态未同步。第 3 次请求的原未知用量、比赛暂停、ETF 归档续验停止及完整历史／实时业务未验收状态保持；远端无回执仍需原 LM Studio 服务日志确认，本次本地修复不能替代该原因验证。
