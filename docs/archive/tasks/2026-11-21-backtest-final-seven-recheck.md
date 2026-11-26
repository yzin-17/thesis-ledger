# 最终版本七例完整复验

日期：2026-11-21，完成于2026-11-22。现行合同见[策略回测详细设计](../../specs/2026-11-20-backtest-practical-design.md)，前序实施见[归档任务](2026-11-20-backtest-practical-design.md)。最终固定版本七例完整通过，见[最终验收证据](../../evidence/2026-11-22-backtest-comparison-readback-recheck.md)。

## 范围与授权

范围为零调用复核、生成端修复与固定版本整批验收。七例为计数确认、带宽与跳空、冻结前高、多周期累计、会话VWAP算术、仅后复权探索、仅加止损。全部原意、原始说明、创建和冻结执行通过后完成。

前序 `strategy-optimization-v25-semantic-guide`／`authoring-prompt-v33-semantic-guide` 完整业务4／7，证据见[语义闭环验证](../../evidence/2026-11-22-backtest-semantic-generation-loop.md)。该批及更早结果保留。

沿用原模型和原生Schema路由，复用已有私有资格，新增探针0、自动重试0。每个修复版本整批上限7。最终累计69／600次，余额531。真实复验只写专属隔离库与私有证据。

## 执行状态

- [x] D1：零调用复现两种缺失可选字段的覆盖漏洞。修复前的定向运行保留2个预期失败，30项独立原意测试通过，包含两种比较边界及止损启用成对例。日志 `t13-v26-pairs-before.log`。
- [x] D2：V6编写按实际定义关联覆盖，输出按定义／覆盖／回读排列；独立测试确认带宽的严格边界、两种保护启用和分钟时钟。Server定向45项含28份历史回执核对及实际原生Schema验证，Schemas定向16项、两包构建、Server类型及lint／边界／尺寸通过。旧保护回归测试改为读取原V5注册表，V5输出合同保持。七例零调用预检通过。候选版本为 `strategy-optimization-v26-comparison-boundaries`／`authoring-prompt-v34-linked-coverage`。
- [x] D3：同版七例响应7／7，正式编译5／7，原意、创建及冻结执行4／7，原始说明核对后完整业务3／7。会话覆盖和分钟时钟通过。两容器与宿主一致，前后5244份文件一致，实际七次无探针、重试或未知。见[本批独立证据](../../evidence/2026-11-22-backtest-linked-coverage-recheck.md)。
- [x] E1：零调用成对验证及Domain的保护等值执行通过。探索按冻结周期和字段装配参考，完整Schema以及七例用户消息、数据范围保持；局部计划明确保护线包含等值。Server定向49项、Domain定向9项、构建、类型、lint、边界、尺寸和七例零调用预检通过。计划版本为 `strategy-optimization-v27-scoped-expressions`／`authoring-prompt-v35-stop-boundary`。
- [x] E2：v27／v35同批正式编译与原意7／7、创建和冻结执行6／7，原始说明核对后完整业务4／7。正式同步、目标只读核对及5245份输入前后核对通过。见[本轮独立证据](../../evidence/2026-11-22-backtest-scoped-expressions-recheck.md)。
- [x] F1：零调用比较与交叉回读，以及真实会话坐标对照通过。V6输出按现有显示词汇标明比较／交叉，编写明确指标与会话相对偏离的研究坐标；原生Schema结构等价。Server定向50项、Domain回读5项、Schemas6项、两包构建、类型／lint／边界／尺寸及七例零调用预检通过。候选为 `strategy-optimization-v28-comparison-readback`／`authoring-prompt-v36-research-coordinate`。
- [x] F2：七例零调用预检、正式同步与只读核验通过。固定v28／v36的5246份文件前后一致，同批七例各一次。正式编译、隔离创建、重复冻结执行、实际原意与原始说明均通过。详见[复验记录](../../evidence/2026-11-22-backtest-comparison-readback-recheck.md)。
- [x] 七例同批完整验收7／7。按实际操作符回读计数和多周期，会话使用冻结范围内的研究价格，止损含等值边界。最终只使用本批七份原始回执，源码与目标Server／Worker一致。

写集边界：Schemas编写操作的V6覆盖合同、Domain生成说明／合法示例、Server V6提示和受控验收；沿用正式编译、模拟、数据和隔离入口。旧批回执及统计保留。
