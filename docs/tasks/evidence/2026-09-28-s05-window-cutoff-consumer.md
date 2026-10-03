# S05 窗口冻结截点消费者核对

## 状态与修改范围

`S05-window-cutoff-consumer-0928 / worker_done`，等待父级最终验收。唯一测试修改为 `apps/server/test/market/market-pit-decision-window-v3.test.ts` 的第 349 行标题及第 355 行理由预期；仍使用晚于冻结截点一微秒的输入，仍要求 unavailable。新增本文。未修改生产源码、Schema、Spec、Task 或索引；保留既有 dirty WIP，未 stage、commit、reset、clean。已读取用户 AGENTS、RTK、Codex reference 与 codex-cost；Context 工具不可用，执行使用 `rtk proxy` 与有界输出。无子代理，无部署、数据库、Provider、AI 调用。

## 前置拒绝顺序与合同

fixture 的 `dataAsOf` 是 `2026-05-21T08:00:00.000Z`，测试同时把输入与 proof 的 `sourcePriceBasis.observedAt` 改成 `2026-05-21T08:00:00.000001Z`，保持两者一致，制造未来一微秒事实。

`packages/schemas/src/market-pit-reconstruction-v3.ts` 的 v2 `superRefine` 将观察时刻纳入 facts，并通过精确 `compareInstant` 判断是否晚于 proof.dataAsOf；因此该 proof 在结构校验阶段已无效。`bindMarketPitReconstructionManifestV3` 第 212–213 行先 safeParse，返回 unavailable/invalid-proof。窗口 `bindWindows` 第 104–105 行先消费这一结果，沿既有映射返回 unavailable/input-mismatch；第 108–109 行的 evidence-future 检查尚未执行。

主 Spec §6.1 要求已发生事实受 dataAsOf 约束、缺失或时点不符失败关闭，未约定该组合输入的专门错误优先级。现实现满足该合同。本次使测试明确验证 Schema 提前拒绝的消费者行为，没有修改 API、错误优先级或放宽精度。已有其他无效输入用例继续由关联测试覆盖，没有增加镜像测试或泛化用例。

## 验证命令与结果

以下均 exit 0，没有 skip；测试发现范围与指定文件一致。先单文件通过，再运行关联检查。

| 精确命令 | 结果 |
| --- | --- |
| `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-decision-window-v3.test.ts` | 1 文件，42/42 |
| `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-source-capture-v1.test.ts test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-decision-window-v3.test.ts` | 3 文件，111/111：57 capture、12 content、42 window |
| `rtk proxy pnpm exec eslint apps/server/test/market/market-pit-decision-window-v3.test.ts --max-warnings=0` | 零 warning |
| `rtk proxy pnpm exec eslint apps/server/test/market/market-pit-decision-window-v3.test.ts --max-warnings=0 --rule 'no-nested-ternary:error' --rule 'complexity:[error,20]' --rule 'max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]'` | 零 warning |
| `rtk proxy pnpm exec prettier --check apps/server/test/market/market-pit-decision-window-v3.test.ts` | 通过 |
| `rtk proxy git diff --check -- apps/server/test/market/market-pit-decision-window-v3.test.ts` | 通过；该文件原本未跟踪，另以字节还原核对实际两行变化 |

测试前 SHA-256：`a6e57d79bbddc0b5d53fefcacbc7e0097b85769e4c1756708fe1c8af1c604a4c`；测试后：`4124ad4467b7c168beb5ed3f9e3c6ac1bda94ddac0aab05a9abe5607fee57651`。将标题和理由还原后的 SHA 与前值完全相等，证明没有其他测试字节改动。

## 稳定输入与复用依据

执行前后逐文件核对 191 个稳定输入：Server market 源码、Schemas src/test/fixtures、双方 package.json/tsconfig.json、Server vitest 配置；零变化。来源时钟源码 SHA 为 `6d7d899f8f6c8ad92c7e066ef0f20c107340ed3e930f25480f12c4dfc495a61a`，与上一叶一致。Schemas 131 文件以仓库相对路径排序，逐文件 `路径 UTF-8 + NUL + 原字节 + NUL` 聚合 SHA 为 `6607626460bf20ddee8b93eca846eee682a25f041840c1626a4e3cf75dae98e0`，与上一叶一致。

复用 `2026-09-28-s05-source-times-precision.md` 中的公开日历 82/82 和 Server typecheck exit 0，以及其记录的 Schemas 476 项全包、类型与 build。此次仅改测试标题与字符串预期，未改变这些检查的生产源码、Schema、配置或公开输入；没有重跑这些较高成本检查，也未执行全仓测试、build、部署或真实运行验收。本次 111/111 替代上一叶关联 110 通过/1 失败的结果。

相关源码、Schema、配置、关联测试或公开原文改变时须重新判断证据有效性。所有执行命令已退出，无后台进程；交还本叶两条路径写权与 Server 检查资源，本会话不承接下一任务。
