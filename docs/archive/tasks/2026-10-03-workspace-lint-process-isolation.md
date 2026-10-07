# 工作区 lint 进程隔离任务

> 日期：2026-10-03
> 状态：本地实施与验收完成；Linux CI 结果由推送后的工作流单独报告。
> 对应规格：[工作区 lint 进程隔离](../specs/2026-10-03-workspace-lint-process-isolation.md)

- [x] L01：实现实际文件发现、配置忽略判定及工作区分组。
  - 覆盖 AC01；写集 `scripts/lint-workspace.mjs`，不修改 ESLint 规则或忽略配置。
  - 验证：清单模式输出各组与总文件数，核对未重复和非工作区文件覆盖。
- [x] L02：接入根 lint 并完成全范围执行。
  - 依赖 L01；覆盖 AC02/AC03；写集 `package.json` 的 lint 与 complexity 命令。
  - 验证：脚本语法/格式、根 `pnpm lint`、`pnpm guardrails:complexity`；两个命令的原规则与范围不变，任意子进程非零退出使根命令失败。
- [x] L03：等价修复全范围检查暴露的 lint 错误。
  - 写集：Desktop 的三份测试与 `StrategySections.tsx` 未使用导入、Schemas 两份 V3 测试、Server `result-read-policy.service.ts`；不改变领域合同或读取授权判断。
  - 验证：38 项 Desktop 定向、V3 wire/catalog 定向、结果读取策略及接线定向、三个包 typecheck，再复验实际受影响包的全量测试与根 lint。

## 证据与边界

独立覆盖探针使用 ESLint 本身的根目录扫描获得文件清单，与新入口清单逐项相等：1419 个文件、9 组，没有重复文件；其中根 `scripts` 下 3 个 TypeScript 文件也被覆盖。全范围执行随后发现桌面 12 项、Server 7 项及 Schemas 11 项既有 lint 问题，追加等价修复：删除未使用导入、给 mock 与良好 fixture 明确类型，保留非法候选断言，结果读取继续剔除原有同一批封存字段。没有新增 ESLint 忽略或降低规则。

### 字段剔除工具选择

已使用 `recommend` skill 检查 Server 的实际依赖、es-toolkit 1.51.0 的 root 导出、声明与实现，以及官方文档。选择 `import { omit } from 'es-toolkit'`，例如 `omit(record, ['test'])`；严格版浅复制后删除指定键，不修改输入，符合当前普通 DTO 的既有字段剔除语义。

| 函数 | 输入 | 行为与代价 | 返回类型 | 选择条件 |
| --- | --- | --- | --- | --- |
| [omit](https://es-toolkit.dev/reference/object/omit.html) | 对象、要删除的键 | 浅复制全部自有可枚举属性后删除指定键，O(n+k) | `Omit<T, K>` | 本次按固定剔除名单保留其余 DTO 字段。 |
| [pick](https://es-toolkit.dev/reference/object/pick.html) | 对象、要保留的键 | 按名单读取自有属性，O(k) | `Pick<T, K>` | 已有明确完整保留名单时使用；本次会改变扩展字段保留语义，未选用。 |

Schemas 未依赖 es-toolkit，反例只需删除两个良好 fixture 的字段，使用 `Partial` 副本与原生 `delete`，不为测试引入新的运行依赖。

原根 lint 的构建、边界和依赖检查已通过，ESLint 最终因默认堆内存耗尽退出 134。仅受本次等价修复影响的包重新验证；DSA、目标 Docker、浏览器及冻结重放输入保持原有运行版本，本轮不重复部署或构建镜像。Linux CI 的实际结果由本次推送后工作流单独报告。

### 最终验证

最终执行入口按目录传递工作区目标，避免平台命令行长度限制；清单发现逻辑仍核对全部文件。当前脚本语法与格式检查通过，`pnpm lint` 完整通过，覆盖 1419 个文件、9 组；构建、边界和依赖检查均通过。`pnpm guardrails:complexity` 完整通过，覆盖 1416 个文件、8 组，保留原有 warning 策略。另以 `GUARDRAIL_BASE_REF=HEAD node scripts/check-file-size-guardrails.mjs` 复核实际基线 ratchet，通过。

38 项 Desktop 定向、14 项 V3 wire/catalog、6 项结果读取与接线测试通过，三个受影响包的 typecheck 通过。最终全包回归：Schemas 589 项通过，Desktop 543 项通过，Server 2074 项通过、125 项跳过。首次工作区 lint 的 Desktop 错误使根入口退出 1，确认子进程失败会传播。

最终输入为 `scripts/lint-workspace.mjs`、`package.json` 及 L03 写集；日志：`/private/tmp/thesis-ledger-prepush-lint-directories-20261003.log`、`/private/tmp/thesis-ledger-prepush-guardrails-directories-20261003.log`、`/private/tmp/thesis-ledger-prepush-size-ratchet-20261003.log`，以及 `/private/tmp/thesis-ledger-prepush-{schemas,desktop,server}-full-20261003.log`。
