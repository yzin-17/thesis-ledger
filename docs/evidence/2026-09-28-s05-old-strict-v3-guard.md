# S05 旧严格 V3 快照执行保护证据

## 状态与范围

- 任务：`S05-old-strict-v3-guard-0928`；状态：`worker_done`，本地安全封口完成。
- 工作区：主仓 `fe0e871e` 上的既有未提交工作区；未暂存、提交、重置或清理其他改动。
- 依据：当前 Spec §6 的既有 finalized 严格 V3 最终证据要求；这是最终核验与证据封存尚未实现时的失败关闭保护，不是合格 PIT 离线重验实现。
- 仅写入四个代码／测试文件及本证据文件。未读取并行日历解析器的实现，未修改共享 Schema、builder、导出或错误分类器。

## 已完成行为

`LocalSnapshotV3Store.finalize` 在候选生成、幂等哈希快捷返回和任何文件变更之前核对传入协议；读取既有状态后也核对原协议，防止调用方降级候选绕过保护。`replay` 在加载及 manifest 完整性检查后、产物读取与返回之前执行相同保护。

所有 `history.basis === 'point-in-time'` 的 V3 使用现有 `SnapshotV3InputPlanError` 约定返回稳定 `DATA_UNAVAILABLE`，诊断包含 `historicalDecisionWindow` 最终核验与离线封存尚未实现。非空重建引用、metadata 中伪最终布尔值和自定义额外 Parquet 不会授予能力。没有新增成功标记、配置或 Provider 读取。

`load()` 保留原有 Schema／哈希校验与只读行为；原 finalized 文件及全部原始 Parquet 字节不变。固定 V3 的首次冻结、重放和幂等 finalize 沿用原行为，V1/V2 路径未改。既有输入校验编排与产物行读取提取至语义明确的 validation 模块，执行顺序及错误约定保持不变。Store 由基线 293 行缩为 274 行，未扩大存量大文件。

## 本地验证

执行目录：`apps/server`，Vitest `3.2.7`。

```sh
rtk proxy pnpm exec vitest run test/backtest/v3-strict-snapshot-replay-guard.test.ts test/backtest/v3-snapshot-builder.test.ts test/backtest/legacy-snapshot-version-boundary.test.ts test/backtest/legacy-nav-snapshot-replay.test.ts --cache=false --coverage.enabled=false
```

最终结果：4 个文件、16 项测试通过。新增 4 项测试通过真实 `LocalSnapshotStore`、Artifact 和 Parquet 构造合法固定 V3，再控制地调整协议、原始 config 及校验和以模拟旧 finalized 严格快照。每项使用唯一 `s05-old-strict-v3-guard-` 临时目录；测试后仅移除自己创建的目录。

覆盖：严格重放拒绝；旧终态 finalize／重复 finalize 拒绝；调用方固定协议不能替代旧严格协议；building 严格首次 finalize 拒绝且无 finalized 文件；伪最终布尔值和自定义产物拒绝；只读加载允许；finalized／building 及原始 Parquet 字节保留；固定 V3 重放／幂等 finalize 通过；既有固定 V3 builder 和 V1/V2 回归通过。

首次运行新增测试失败于 fixture 构造：building 候选误保留 finalized 专属比较指纹。清除该字段后通过；随后补充协议降级和全部 Parquet 原字节断言，最终再次运行上述完整定向组合通过。生产保护未因测试修复变更。

四个拥有代码／测试文件的 `pnpm exec eslint ... --max-warnings=0` 通过；相同文件的 `pnpm exec prettier --check ...` 通过。自评审确认：只读 load 无变化；两个可执行入口均在快捷返回前失败关闭；固定协议输入校验仍按原顺序执行；没有写入旧历史资格或增加反向跨 feature 依赖。

## 基线与最终摘要

Store 输入 SHA256：`2bde3dcd26a293f87783b2a92a981bdc1a7c8d10101d172544ec909535cbe029`。

| 文件 | 最终 SHA256 |
| --- | --- |
| `apps/server/src/backtest/backtest-snapshot-v3-store.ts` | `c4638dd8369c17bc9144465f732b52737edc649fb3d87a076501019326f17eed` |
| `apps/server/src/backtest/backtest-snapshot-v3-validation.ts` | `1648301ecdae856dfadcb1b4bf43c3331a2d7d6b3570fd02b5de3d4e2afdf17c` |
| `apps/server/src/backtest/backtest-snapshot-v3-pit-guard.ts` | `0c6237f00fe7a68ccd4146700a4c2e3a4684ba716d6ace4d5f069dd098b71f3e` |
| `apps/server/test/backtest/v3-strict-snapshot-replay-guard.test.ts` | `baab4b00eba7b3eed2f739156a59b1a624c0595e13baf60bbbceddc4e1c389df` |

## 保留限制

未执行 Server 包级 typecheck、build、全量测试或 Docker／真实运行时；稳定集成验证由父任务保留。最终合格离线成功路径仍需后继独立任务实现完整原文验证、场所及 XSHE 日历证据、封存与相同验证器离线复算；本任务在这些能力可用前始终阻断严格 V3。真实 Provider／来源准入及完整产品验收仍未完成。
