# 双端比例展示的精度与非零语义

## 问题与目标

Desktop AllocationWeight 与 Mobile 收益投影均把比例乘以 100 后调用 toFixed(2)。极小非零值归零，负权重显示为负零，1.005% 受浮点误差影响显示为 1.00%，有限超大值还会因乘法溢出显示 Infinity%。

使用 Domain 现有十进制单位投影统一只读比例展示。普通数值保留两位小数，极小非零与超大数值使用科学计数，保持原值、金融计算与原可用性语义。

## 验收标准

- AC1：共享比例格式化支持正负、零、Number.MIN_VALUE、Number.MAX_VALUE、普通及临界小数；普通值固定两位，0.01005 显示 1.01%，极小非零不归零，有限输入不显示 Infinity；空值与非有限值显示不可用。
- AC2：Desktop 实际 AllocationWeight 消费该合同，负权重与超过 100% 的权重继续如实显示，普通进度条仅用于原 0～100% 范围；加载/不可用条件与 DOM 结构保持。
- AC3：Mobile 现有 displayRatio 导出委托共享合同，实际 PerformanceResults 的收益、覆盖率、权重和目标消费一致。普通值与原目标配置、筛选及查询逻辑保持。
- AC4：新增 Domain、实际 Desktop 与 Mobile 投影回归先证明旧代码失败；Domain、Desktop、Mobile 适用完整包、构建、lint 和仓库门禁通过。
- AC5：在 1440/1024/768/390 实际浏览器中验证 Desktop AllocationWeight 和 Mobile PerformanceResults 的受控渲染，覆盖极小正负值、普通取舍、超过 100%、空值及极端值，检查进度条、文字与容器溢出；业务请求和写入为 0。

## 所有权与执行边界

比例单位及其稳定展示合同由 packages/domain/src/ratio-percent.ts 拥有；两个客户端只消费公共导出。沿用已核对的 es-toolkit 选型，常规浮点 round/multiply 不满足该文本合同，复用现有单位文本与原生 Intl。巨大的百分比整数以 BigInt 接入格式化，避免再次通过浮点数溢出。

浏览器隔离入口使用现有 Desktop Vite 和已安装 react-native-web 渲染真实 Mobile 结果组件，只替代未参与验收的原生运行环境与图表容器；这些替身不提供比例、收益或权重展示逻辑。验收样本分别归属各自应用，由同一 Vite 配置加载独立页面；单独启停验收服务，不改变既有 5173 服务。明确记录其为受控浏览器组件验收，不等同原生编译或目标部署。

不新增产品渲染分支、样式、依赖或网络请求，不修改 Server 协议、数据库、历史数据、金融计算或原生工程，不执行 Docker、外部来源、模型或真实业务写入。

实施由[任务](../archive/tasks/2026-11-07-ratio-percent-display.md)持有。
