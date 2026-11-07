# 优化参数精确步长验证记录

对应[规格](../../specs/2026-11-07-optimization-step-precision.md)与[任务](../tasks/2026-11-07-optimization-step-precision.md)。

## 当前结论

精确倍数和实际提案校验完成验收。Domain 545、Server 3948 项通过；399 个条件性跳过保留，四包构建、适用门禁通过。

## 原始反例与修复

| 范围 | 原实现结果 | 原始报告 |
| --- | --- | --- |
| 精确倍数接口 | 11 项失败，原实现没有显式接口 | /tmp/goal-step-domain-before.json |
| 实际提案与候选入口 | 11 项中 7 通过、4 失败：3 个偏差被接受，候选入口访问了存储 | /tmp/goal-step-server-before.json |
| 非正业务步长 | 13 项中 11 通过、2 失败 | /tmp/goal-step-nonpositive-before.json |

旧步长方法先把商舍入到 16 位，0.1000000000000000001、0.0999999999999999999 及最小值附近的偏差会被当成整步。现由 DecimalValue.isMultipleOf 对齐尺度后判断 BigInt 余数，Server 先验证正步长，再消费该领域能力。

原始十进制字符串直接进入 DecimalValue，整数数值使用 fromNumber。没有把用户输入量化到授权点，没有修改已授权范围、步长定义、基线和提案原文本。合法 0.1000 原样保留，最小/最大值及整数周期通过；白名单、范围、类型、完整策略校验顺序保持。

候选入口隔离回归确认：非整步在候选存储和回测之前被拒绝，未发生真实存储或 Provider 调用。

## 定向与运行版本

- Domain 定向 3 文件 / 46 项通过，/tmp/goal-step-domain-targeted.json。
- Server 定向 3 文件 / 29 项通过，/tmp/goal-step-server-final-targeted.json，包含实际候选入口、现有发现模式及风险预览回归。
- 固定 Node 24 执行 Domain 3 文件 / 46 项通过，/tmp/goal-step-node24.json。
- Domain 完整包 58 文件 / 545 项通过，/tmp/goal-step-domain-full.json。
- 2546 个 Server/领域输入在完整包前记录于 /tmp/goal-step-inputs-before.json。

## 所有权与验收边界

DecimalValue 拥有精确算术；Server 仅适配其参数联合类型并执行授权语义。已核对 scripts/check-boundaries.mjs，既有 DecimalValue 禁止反向依赖应用/API 适配层的门禁继续覆盖本次能力，不需要新增跨层依赖或放宽规则。

本轮没有客户端源码和交互改动，客户端未消费新倍数入口；原[四宽风险交互证据](2026-11-07-risk-decimal-boundaries.md#真实浏览器复核)保留其原输入范围，不宣称本次重新执行完整客户端测试或浏览器矩阵。两端构建单独检查公共接口兼容性。

没有执行 Docker、外部服务、模型、正式回测或真实业务写入；既有冻结候选不重写。

## 最终集成结果

| 检查 | 结果与原始证据 |
| --- | --- |
| Domain 完整包 | 58 文件 / 545 项通过，/tmp/goal-step-domain-full.json |
| Server 完整包 | 588 文件 / 4347 项中 3948 通过、399 条件性跳过、0 失败，/tmp/goal-step-server-full.json |
| 四包构建 | Domain、Server、Desktop、Mobile 均通过，/tmp/goal-step-{domain,server,desktop,mobile}-build.log |
| ESLint | 4 个改动文件通过，/tmp/goal-step-lint.log |
| 格式 | DecimalValue 与 2 个测试文件通过，/tmp/goal-step-prettier.log |
| 依赖边界与工作区依赖 | 通过，8 个包依赖图通过，/tmp/goal-step-boundaries.log、/tmp/goal-step-dependencies.log |
| 文件尺寸 | ratchet 通过，6 个既有债务警告保持，/tmp/goal-step-sizes.log |

Server 的 399 个跳过项不能作为 PostgreSQL、Redis 或目标部署通过。客户端构建验证接口兼容，Desktop 仍保留既有大 chunk 提示，Mobile 没有 Native compile 结论。

## 最终输入与一致性

2546 个 Server/领域输入在完整包前后和最终构建后相同，/tmp/goal-step-inputs-before.json、/tmp/goal-step-inputs-after-full.json、/tmp/goal-step-inputs-final.json。没有格式清理导致的中途输入变化。

AC1～AC4 均有对应证据：精确倍数、正步长语义、偏差拒绝、合法原始文本、基线不变、整数周期及候选前置拦截均通过。没有改变预算、授权范围、正式历史或真实数据。本主题无剩余实施义务，Task 和专属证据归档，全线程优化 Goal 继续。

本轮 7 份改动文档的 199 个本地链接均存在，/tmp/goal-step-doc-links.json。
