# S05 parser 测试类型修复证据

## 范围与结果

本叶只修改 `apps/server/test/market/market-pit-calendar-package-v1.test.ts` 的 `metadata()` helper 返回类型及本证据文件。显式声明可变 metadata fixture 字段类型，使 SHA-256 和发布时间负例可以赋入字符串，消除两处 `TS2322`。原 fixture 值、负例修改、断言、生产源码与登记常量均保持原样；未使用 `any`、忽略指令或类型强转。

## 输入与运行行为身份

使用 TypeScript `5.9.2` 的 `transpileModule`，设置 `target: ES2022`、`module: ESNext`、`sourceMap: false`、`inlineSourceMap: false`，比较完整 `outputText`；未引入时间戳。

| 身份 | 修复前 | 修复后 |
| --- | --- | --- |
| 测试源码 SHA-256 | `3af01a9473d910fed9941d7ec9c3724663bdd202ca7da0b3ece2f9833dcb94a7` | `d88815e37606ff60c815464b28190d3e50df5563e7cce0a2dae26c1e0ac87548` |
| 编译 JavaScript SHA-256 | `810c06c566539b374412d9abefb5b60e4219e2521a59050109f07d68da791e77` | `810c06c566539b374412d9abefb5b60e4219e2521a59050109f07d68da791e77` |

JavaScript 逐字相同，因此既有 Server 1624 项通过、81 项跳过的运行行为证据仍适用；源码身份应更新为本表修复后摘要。跳过项与真实运行时验收限制继续保留。

## 验证

- `pnpm --filter @thesis-ledger/server exec vitest run test/market/market-pit-calendar-package-v1.test.ts test/market/market-pit-calendar-package-source-v1.test.ts test/market/market-pit-calendar-package-projection-v1.test.ts --cache=false`：3 个文件通过，75 项通过、1 项跳过，共 76 项；跳过为未设置 `S05_CALENDAR_PUBLIC_INPUT_DIRECTORY` 的公开输入探针。
- `pnpm --filter @thesis-ledger/server typecheck`：通过。
- `pnpm exec eslint apps/server/test/market/market-pit-calendar-package-v1.test.ts --max-warnings=0`：通过。
- `pnpm exec prettier --check apps/server/test/market/market-pit-calendar-package-v1.test.ts docs/tasks/evidence/2026-09-28-s05-parser-test-types.md`：通过。
- 修复前后差异核对：仅新增 helper 返回类型；无断言或运行语句变化；行尾空白及文件结尾检查通过。

原始日志位于 `/private/tmp/s05-parser-directed-exec.log`、`/private/tmp/s05-parser-typecheck.log`、`/private/tmp/s05-parser-lint.log`。

## 命令范围偏差与限制

首次命令 `pnpm --filter @thesis-ledger/server test -- <三个测试文件> --cache=false` 的参数被当前 script 执行器忽略，实际意外执行全包：222 个文件通过、23 个文件跳过，1624 项通过、81 项跳过，耗时 41.83 秒，日志 `/private/tmp/s05-parser-directed.log`。此命令不能作为三个文件定向执行或关闭缓存的证据；随后改用上方 `exec vitest` 取得准确定向结果，未再次执行全包。

未执行 build、仓库门禁、Docker、数据库、浏览器、真实 Provider 或部署验收。主 Spec/Task 与父级台账保持只读，最终 review 与后续集成由协调者负责。
