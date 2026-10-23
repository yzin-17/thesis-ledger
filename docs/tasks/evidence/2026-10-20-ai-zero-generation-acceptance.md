# AI 配置与 SDK 的零生成验收差集

日期：2026-10-20。对应 [AI 配置 Task 的 T2.5.E4](../2026-09-21-ai-provider-model-usage-configuration.md#剩余步骤)及 [SDK Task](../2026-09-19-vercel-ai-sdk-integration.md)。本轮客户端范围为 Web；真实连接、用途测试和模型生成继续暂停。

## 已完成的增量

1. 新增 `apps/server/test/ai/ai-provider-route-http.test.ts`，通过实际 Nest HTTP、现行 Controller、输入 Schema 和异常过滤器验证：同模型同用途的同模式、不同模式重复路由均返回 400，保存服务零调用；不同模型的路由可普通保存，不触发连接或生成测试。保存服务为受控替身，本项不证明数据库持久化或 Provider 实源。
2. 沿用已获准的 `controlled-web-save-20261020` 临时配置：停用、无密钥、无用途路由。维护入口创建优先级 991；目标 Web 实际编辑并保存 992。维护入口随后提交原版本的同一配置草稿，实际返回 409，992 和新版 `updatedAt` 均未变化。
3. 同一维护入口删除临时配置；实际 Web 刷新后该行消失。原 ProviderConfig、AiRoutingSettings、加密凭证、七张业务保护表、V3 成功结果、容器身份、暂停配置与调用计数逐项相等。
4. 核对现行完整 AC 与 SDK 原编号的证据差集，复用已经通过的目录、默认引用、迁移与生命周期证据。环境接管已退役，历史 E1 不恢复为新任务。

## 目标 Web 的命令与回执

执行目录：相邻 `thesis-ledger-infra`。以下三个维护命令均退出 0；中间的优先级编辑由目标 Web `http://127.0.0.1:5183/providers` 完成。

```sh
node scripts/ai-provider-web-acceptance.mjs prepare --target thesis-ledger-dev --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/p1-web-conflict-20261020-1
# 在 Web 将专属配置优先级 991 保存为 992。
node scripts/ai-provider-web-acceptance.mjs verify-conflict --target thesis-ledger-dev --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/p1-web-conflict-20261020-1
node scripts/ai-provider-web-acceptance.mjs finish --target thesis-ledger-dev --output /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra/.maintenance-backups/p1-web-conflict-20261020-1
```

回执：`thesis-ledger-infra/.maintenance-backups/p1-web-conflict-20261020-1/report.json`，SHA-256 为 `455a99830014b521bb892fcd180776d28b61c0956f849802c740afc7cb4beecd`。`fixtureRemoved`、`existingConfigurationPreserved`、`protectedDataPreserved`、`providerVersionConflict.passed` 均为 `true`，`realModelRequests=0`。

截图保存在主仓私有目录 `.recovery-artifacts/p1-g4a-2026-10-20/provider-saved.png` 与 `provider-restored.png`；前者显示 992，后者显示临时行已移除。本次未对已有配置、默认引用或实际用户凭证执行写操作。

## 完整 AC 的现行差集

完整 AC-01～30 的唯一状态表仍在原 Task；以下只说明此次核对后的边界。

| 完整 AC | 可复用或本次补齐的证据 | 仍未覆盖的条件 |
| --- | --- | --- |
| 01、04、05 | E2/E3 及 Web 草稿、切页、目录/迟到响应、离开保护 | 实际 Provider 连接不由受控目录响应证明；Electron 本轮不验 |
| 02、06、08、16 | 双向类型草稿、停用配置保存、旧混合路由序列化；本次目标普通保存及凭证摘要保护 | 目标存量混合配置的正向转换、实际凭证转换保存及非 AI 完整业务条件 |
| 03、15 | 无认证历史实源证据与现行受控 Adapter 验证 | 当前有认证的真实连接；继续暂停 |
| 07 | 新增实际 HTTP 三项，重复路由在保存前拒绝，合法不同模型可保存 | 本断言的 HTTP 边界已补齐；不代替启用配置的真实用途测试 |
| 09 | 既有实际 SDK/本机 HTTP/SSE 生命周期、超时与取消证据 | 跨业务执行面和目标实际用途的完整期限条件 |
| 10～14 | 模型价格、冻结、预算、未知/零值区分、受控费用事实与迁移规划 | 真实非零授权、结算、上游费用及历史任务完整集成 |
| 17～20 | 既有 PostgreSQL 研究提交、默认切换竞争与冻结；目标空默认拒绝 | 目标显式默认的正向研究及策略真实消费 |
| 21 | 既有 PostgreSQL 原子清除/回滚与 E3 Web 确认、取消、失败保留 | 目标真实默认引用的生命周期正向条件；本次未修改默认 |
| 22 | 自动确认/复用证据、普通保存、切页/详情的零生成断言；本次目标 Web 保存及中性状态 | 本次目标普通保存零生成已补齐，未用它代替真实用途验收 |
| 23 | 指定模型、单飞、取消、授权与历史零价用途证据 | 当前真实非零费率授权与用途生成；继续暂停 |
| 24 | 客户端迟到失效/单飞；Server 指纹、证据复用、超时变更失效及单用途失败保留其他成功均有定向通过结果 | 当前实源用途失败的目标归因，不因本地通过而关闭 |
| 25、26 | 三项迁移规划验证零值/精度、已有模型价格保留、稳定规划、缺字段和重复路由冲突 | 完整 PostgreSQL 值迁移、冲突应用及幂等条件；规划不是数据库迁移 |
| 27 | 既有旧客户端拒绝；正式保留升级、当前原配置/默认/业务摘要不变；G4a 的保存报告恢复 | 原历史任务与全部部署兼容条件继续按各自 Task 验收 |
| 28 | 原 PostgreSQL 竞争证据；本次目标 Provider 过期保存 409 且无覆盖 | 默认设置的目标并发/正向消费仍开放，不由专属 Provider 断言替代 |
| 29、30 | 原能力移除归档证据、现行边界门禁、数据库唯一来源交付、目标 Web 停用配置闭环 | 真实认证、业务正向输出、非零费用及其他完整运行态门禁 |

目标只读配置投影共三条；两条正常 AI 配置各投影六条路由，已有验收配置投影一条路由，模式均为 `native_schema`，其中一条配置显示凭证已配置。本次未把受控混合路由或凭证摘要相等冒充目标混合配置转换及认证成功。

SDK AC01～48 继续使用原 Task 的责任映射：AC01/19/25/28/36/40 的三类真实业务由 G1 保留；AC47/48 的现行保存子集复用本次 Web/HTTP 证据及已完成数据库唯一来源交付；完整 Chat/Responses、流式用途、费用与期限的未过条件保持不变。历史“剩余四次”不恢复，本轮不增加真实请求账本。

## 定向验证

| 命令或范围 | 最后结果 |
| --- | --- |
| Server：`vitest run test/ai/ai-provider-route-http.test.ts test/ai/ai-provider-upstream.test.ts test/ai/ai-provider-migration.test.ts test/ai/ai-provider-verified-save.test.ts` | 4 文件 36 项通过；修正测试回执字段后通过，最后又验证新增 HTTP 文件 3 项通过 |
| Desktop：`vitest run test/ai-provider-ui.test.tsx test/ai-provider-auto-save.test.tsx test/ai-provider-catalog-refresh.test.tsx` | 3 文件 43 项通过 |
| Server `typecheck` 与新增 HTTP 文件 ESLint `--max-warnings 0` | 均通过；测试的未使用参数已修正 |
| Infra：观察保留、双读运行边界、目标 Web 维护三组 `node --test` | 14 项通过，包含查询失败不能冒充资源缺失的反例 |

日志位于主仓 `.recovery-artifacts/p1-g4a-2026-10-20/`。已通过的全站 Web、生产构建与部署输入没有改变，本轮未重复全量 UI 回归或构建镜像。T2.5/T5.2、T6 和 SDK G1 仍按完整条件保持未完成。
