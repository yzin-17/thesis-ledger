# S05 来源时钟精度修复检查点

## 状态与范围

`S05-source-times-precision-0928 / needs_split`。来源时钟实现及 owned 门禁完成，关联窗口测试仍有一项失败，不能标记 worker_done。父进程已授权完成 owned 卫生与本文，随后停止；非 owned 窗口测试与错误优先级须由新鲜独立叶核对。

依据主 Spec §6 与主 Task §12.8 本 ID；HEAD 为 `fe0e871e37a09964f7a113b82e7d09f6d4d95f7e`，开始存在 539 条 dirty WIP。已读取 AGENTS、Codex reference、RTK、codex-cost。Context 工具不可用，使用 `rtk proxy` 和有界输出。没有子委派、stage、commit、reset、clean、数据库、SQL、Provider、AI、业务任务或部署；没有修改 SSOT。所有写入均为原生 apply_patch，格式结果由 Prettier 只读输出后经 apply_patch 应用，未使用格式化写入命令。

## 实现与合同

Server 既有瞬时入口兼容再导出 Schemas 原三个 API，另再导出其安全字符串比较器，删除重复算法。来源时钟使用同一整数秒与最多 1024 位小数原语；保留原始 timestamp、availableAt、observedAt、fetchedAt 文本。归档 Bar 索引使用已解析秒数与去尾零小数，等价 offset／尾零仍判重，同毫秒不同瞬时独立保存。

原观察顺序、归档内时间／可见事实顺序、首错误遍历次序与理由保留。归档要求 availableAt <= observedAt；绑定要求 observedAt <= availableAt，两者共同形成精确瞬时相等，未放宽。非法日期、未知 offset、非法 offset、超长小数均失败关闭。非法引用时刻不能命中归档，维持 bar-archive-missing。此必要绑定仍不能授予 historical-window-bound。

新增 11 项测试（原 12，最终 23）：观察晚一微秒、抓取早一微秒、价格和可见事实未来一微秒、价格晚于可见一微秒；同毫秒不同瞬时、等价 offset 引用与原字符串不变；等价 offset 重复拒绝；四个时钟位置各测试非法日期、-00:00、+24:00 和 1025 位小数。16 个非法变体在四项参数测试中分别使用新鲜夹具。

## 检查结果与阻塞

以下测试没有 skip。Server 包名及 test/typecheck 实际脚本已核对，定向调用直接 exec vitest，未误跑全包。

| 命令／范围 | 结果 |
| --- | --- |
| `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-reconstruction-source-times-v3.test.ts` | 1 文件，23/23，通过 |
| `rtk proxy pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-source-capture-v1.test.ts test/market/market-pit-reconstruction-content-v2.test.ts test/market/market-pit-decision-window-v3.test.ts` | 3 文件，110 通过／1 失败；capture 57、content 12、window 41 通过／1 失败 |
| `rtk proxy env S05_CALENDAR_PUBLIC_INPUT_DIRECTORY=/private/tmp/s05-calendar-package-0928 pnpm --filter @thesis-ledger/server exec vitest run --cache=false test/market/market-pit-calendar-schema-interoperability.test.ts test/market/market-pit-calendar-package-v1.test.ts test/market/market-pit-calendar-package-source-v1.test.ts test/market/market-pit-calendar-package-projection-v1.test.ts` | 4 文件，82/82，通过；真实公开原文解析，无网络请求 |
| `rtk proxy pnpm --filter @thesis-ledger/server typecheck` | 实际 tsc --noEmit，exit 0 |
| `rtk proxy pnpm exec eslint <3 个 owned TS> --max-warnings=0` | exit 0，零 warning |
| 上述 ESLint 加 `no-nested-ternary:error`、`complexity:[error,20]`、`max-lines-per-function:[error,{max:220,skipBlankLines:true,skipComments:true}]` | exit 0，零 warning |
| `rtk proxy pnpm exec prettier --check <3 个 owned TS>` | exit 0 |
| `rtk proxy git diff --check -- <3 个 owned TS>` | exit 0 |

关联失败位置：`apps/server/test/market/market-pit-decision-window-v3.test.ts:353`，测试“输入观察晚于冻结一微秒仍拒绝”。期望 unavailable/evidence-future，实际 unavailable/input-mismatch。共享 Schema 精确比较更早拒绝导致理由变化；未修改该非 owned 文件、未放宽拒绝。该行为与既有首错误合同需另叶核对。

流程偏差：第一次 apply_patch 将同一 helper 删除和新增放在一份 patch，被工具拒绝且无写入；改为单次 Update 后成功。关联测试调用脚本未在首失败后退出，随后真实日历及 typecheck 已执行并通过，发现后立即报告并暂停；没有把该流程或关联失败记为通过。父进程只授权完成 owned 格式／lint／diff／证据，不再重跑类型、82 项或其他测试。最终源码经只读 Prettier 格式调整，只有空白与换行变化；测试／类型结果对应相同语义输入，未重复高成本验证。

## 稳定依赖与摘要

Schemas 131 文件聚合 SHA-256 与上叶证据完全一致：`6607626460bf20ddee8b93eca846eee682a25f041840c1626a4e3cf75dae98e0`。精确算法为：Schemas src/test/fixtures 全部文件及 package.json、tsconfig.json，按仓库相对路径排序，每文件更新 `repo-relative-path UTF-8 + NUL + raw bytes + NUL`。复用上叶 476 项全包、类型与 build，不重新执行；本叶没有修改其输入。第一次以 package-relative 且无字节后 NUL 算得不同值，已通过四种算法核对并由父进程确认，属于算法差异，不是依赖漂移。

公开输入 metadata.json SHA-256 为 `38a86c1c1058cbaa84cb85ecafea74f9b19a7b87c10998a82f9df230bb52a87a`，sources.json 为 `e896e815c17a790f65af15353153d79ca22feee19653d874dc6008e8d74abc0a`；两者与既有真实输入证据一致，本次 82 项实际重新解析。

| 文件 | 修改前 SHA-256 | 修改后 SHA-256 |
| --- | --- | --- |
| `apps/server/src/market/market-pit-evidence-instant-v1.ts` | `e6fe936cfcd90ec6bf17bc9905903f80792f94cefb0c0dcad4c05a16c7768f76` | `b569495a1dc95419b25d3b7744e1e8fda68fa18b281a46393b36b11fd79061bd` |
| `apps/server/src/market/market-pit-reconstruction-source-times-v3.ts` | `0c2528d1994e0f2a4edb323979e1c07c68dc69b98dc26d096599f55d4b9172ef` | `6d7d899f8f6c8ad92c7e066ef0f20c107340ed3e930f25480f12c4dfc495a61a` |
| `apps/server/test/market/market-pit-reconstruction-source-times-v3.test.ts` | `bbcb955ba699f7306e3f0ac33f49ee522cdd5aff1852cc2c0bbd81999b7499d6` | `ff3e8c8b9dff6b38fb395ef27eadf3dc3a1fc49ca1515246bc4e6cc2cd2324cd` |

以上三个 TS 路径即 lint／格式／diff 的完整输入范围。修改这些文件、Schemas 公共依赖、Server package/tsconfig/vitest/setup、关联源码／测试或公开原文会使相关结果失效。未执行 Server 全包、build 或全局门禁。全部命令已退出，无后台进程；本叶交还全部写权并停止，不复用会话为下一任务。
