# AI 默认设置非生成并发验收回执

按[精确预案](2026-10-21-ai-settings-concurrency-plan.md)接续[配置原任务](../2026-09-21-ai-provider-model-usage-configuration.md) AC-28。主线程执行，不调用真实模型；DG3 保持 TODO，只验 Web。

## 实际结果

维护入口为 `scripts/ai-settings-concurrency-acceptance.mjs`，无参数只读生成计划，显式 `--apply <计划文件>` 才执行四次受限 PATCH。`node --test scripts/ai-settings-concurrency-acceptance.test.mjs` 的 11 项保护检查、Node 语法和受影响文件格式检查通过。计划指纹为 `59c172643f683cc3249d86a976fc73476d8cc6ed2507e7643e39d43488c75ba0`；应用入口退出 0。

| 请求                               | 预期                 | 实际      |
| ---------------------------------- | -------------------- | --------- |
| 两个同修订、同原默认的竞争更新     | 一个成功、一个冲突   | 200 / 409 |
| 再次使用原修订 1                   | 冲突，不覆盖胜者     | 409       |
| 当前修订 2 引用不存在的提供方/模型 | 拒绝悬空引用，不写入 | 400       |

现有 `AiRoutingSettings.global` 的 revision 只从 1 到 2，`updatedAt` 正常推进至 `2026-10-20T21:07:02.778`（数据库 UTC）；创建时间和默认引用仍为原值。默认保持 `lmstudio` / `qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive@q4_k_m`，没有启用提供方、修改模型/用途/价格、清空默认或回写旧版本。

## 保留检查与 Web

先核对实际单行的全部其他字段，再验证同一次只读 SQL 的行与表摘要绑定，最后仅归一上述两字段造成的默认设置表摘要变化，比较整个保护状态。十二账户、其余十二表、57 个成功回测、配置/密文/启停/路由、目录及模型计数全部保持。AiRun、工具、观察、invocation/fact 仍为零；既有执行开关未变，真实模型暂停继续有效。

默认设置表摘要由 `c066b8aea87298368420fbf904ea6ccf` 变为 `646f7f864ba02806c5b0094f4416afe2`，只对应上述正常版本变化。完整目标保护 JSON 由 `606c463b182b7d76ad7d31ffbf127fd7d4cd145ffa105d2b70e0ca00835a0c83` 变为 `f572f9214cad03ba756c032a206931be67c43fb894b170f48082d1e6fef2b325`，不声称逐字节无变化。

Web 在研究助手打开未提交面板，研究默认模型仍准确回显原引用，“保存默认模型”因无改动禁用；没有选择新模型或提交研究。关闭面板并恢复原模拟账户的成交记录页，主题及账户范围保持。Web 后再读保护 JSON 与 HTTP 验收结束状态完全一致。

私有证据位于 `.recovery-artifacts/remaining-p1-2026-10-20/`：

- `ai-settings-concurrency-result.json`：`8324ce42992db645b645c0143ebf5f1339690065b7569719c3b8d819ba383fa5`。
- `ai-settings-concurrency-web.png`：`4f57cc6546f714ac8e2a113099d71dba6a69eff69fb8279ad128a82d2e8e1108`。
- 同目录保留计划、11 项保护测试日志、格式日志及 `ai-settings-concurrency-web-after.json`。

AC-28 的目标默认设置并发条件已通过，复用原 PostgreSQL 引用竞争及 E4 Provider 冲突证据。默认模型的真实研究消费仍属 AC-17～20 等对应条件，不能用本次配置验收代替。后续继续核对其余不依赖真实模型的原 AC，总 Goal 保持未完成。
