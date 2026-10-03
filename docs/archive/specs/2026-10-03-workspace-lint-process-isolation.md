# 工作区 lint 进程隔离规格

> 日期：2026-10-03
> 状态：本地实施与验收完成；Linux CI 结果由推送后的工作流单独报告。
> 对应任务：[实施与验证](../tasks/2026-10-03-workspace-lint-process-isolation.md)

## 问题与目标

提交前执行根目录 `pnpm lint`，构建、边界与依赖检查通过，但同一 ESLint 进程在多个 TypeScript 项目累积类型服务状态，达到默认约 4 GiB 堆上限后以 134 退出。新增源码规模已经超过当前单进程执行容量。

保留现有 ESLint 配置、规则、类型检查及零 warning 要求，按实际工作区分配独立 ESLint 子进程。每个子进程结束即释放类型服务状态；不提高复杂度阈值，不新增忽略规则，不改变业务行为、领域契约或运行依赖。全范围检查暴露的未使用导入、未明确类型的测试夹具及封存字段剔除表达，在定向回归下作等价修复。

## 范围与约束

根 lint 保留原构建、边界和 workspace 依赖检查，最后改用工作区执行入口。执行入口从实际文件系统发现当前配置覆盖的 `.ts` / `.tsx` 文件，使用 ESLint 官方 `isPathIgnored` 判断既有忽略规则，不以 Git 是否跟踪决定范围。`apps/*`、`packages/*`、`services/*` 各工作区独立执行，其他目录及根文件也保留在范围内。

`guardrails:complexity` 的 ESLint 执行面同步使用分批入口，仍只覆盖 apps/packages/services。`--guardrails` 保留原三项 warn 规则与复杂度 20、函数尺寸 220 的阈值，不额外施加零 warning 限制；现有文件尺寸检查仍在该命令末尾执行。默认 lint 继续零 warning。

每个文件只分配一次，使用同一锁定 ESLint CLI 和根配置；任意子进程非零退出立即失败。清单模式只用于核对覆盖范围，默认执行必须真实运行全部子进程。

## 验收

- AC01：发现清单覆盖当前配置内的全部 TypeScript 文件，没有新增忽略或重复文件；非工作区文件仍被覆盖。
- AC02：根 `pnpm lint` 及 `pnpm guardrails:complexity` 完整通过；构建、边界、依赖及文件尺寸检查保留原入口，各自原规则与 warning 策略保持一致。
- AC03：脚本语法和格式检查通过，执行失败传播到根命令；不增加运行依赖，不重新构建业务镜像。

## 依据

已检查本地锁定 ESLint 9.39.5 的公开实现；[官方 Node API](https://eslint.org/docs/latest/integrate/nodejs-api#-eslintispathignoredfilepath)定义 `isPathIgnored` 为当前配置的文件忽略判定。原失败日志为 `/private/tmp/thesis-ledger-prepush-lint-20261003.log`。
