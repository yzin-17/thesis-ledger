# 风险十进制边界验证记录

对应[规格](../../specs/2026-11-07-risk-decimal-boundaries.md)与[任务](../tasks/2026-11-07-risk-decimal-boundaries.md)。

## 当前结论

有限数值输入、成本比较、风险权重汇总和新事件摘要已完成验收。Domain 534、Server 3938、Desktop 1389、Mobile 193 项通过，构建、适用门禁及四宽 16 组真实浏览器通过。Server 399 项条件性跳过保持。

## 原始反例

| 范围 | 旧实现结果 | 原始报告 |
| --- | --- | --- |
| 显式十进制入口、成本规则与事件摘要 | 35 项中 7 通过、28 失败 | /tmp/goal-risk-decimal-domain-before.json |
| Server 权重汇总 | 4 项中 1 通过、3 失败 | /tmp/goal-risk-decimal-server-before.json |

失败包含缺少 fromNumber、1e-9 与 Number.MIN_VALUE 的普通十进制解析错误，以及非零摘要变成 0。初次使用 package script 时参数分隔误使筛选失效，Domain 执行了完整包，Server 已停止；该次 Server 不构成完整验收证据。后续统一使用 pnpm --filter <package> exec vitest run。

## 实现与所有权

- DecimalValue.fromNumber 只接受有限原生数值，从其规范十进制表示解析系数和尺度；指数范围由有限 number 限定。原字符串入口保持严格普通十进制语法，金额和数量原文本不经浮点转换。
- 成本止损、止盈在成本大于零时比较 price - cost 与 cost × signedThreshold，不先除法再按 40 位小数舍入。成本止损保留绝对值语义，止盈保留原阈值；严格、策略复制的包含比较和无成本返回不可计算保持。
- Server 账户、组合和同代码集中度汇总转换已存在的 number，保留账户内权重选择、缺失状态和末位容差。
- Domain risk/threshold-format 拥有阈值显示，Desktop 现有 formatThreshold 导出委托该函数；普通百分比最多 3 位、其他数值最多 6 位，极小值改用科学计数。新事件在生成边界消费，历史读取继续返回冻结消息。
- 布尔触发结果使用十进制比较；既有 number context.value、reference 和持久化协议保留，不宣称改变全部数值协议。没有改动阈值准入范围、数据库、日程或通知开关。

## 定向与完整包结果

- Domain 定向 5 文件 / 62 项通过；报告 /tmp/goal-risk-decimal-domain-targeted.json。
- Server 风险相关定向 6 文件 / 52 项通过；报告 /tmp/goal-risk-decimal-server-targeted.json。
- Desktop 定向 3 文件 / 43 项通过；报告 /tmp/goal-risk-decimal-desktop-targeted.json。
- Domain 最终完整包 57 文件 / 534 项通过；报告 /tmp/goal-risk-decimal-domain-final.json。
- Server 完整包 588 文件 / 4337 项中 3938 通过、399 跳过、0 失败；报告 /tmp/goal-risk-decimal-server-full.json。跳过项的 PostgreSQL、Redis 等条件未满足，不能作为实际运行态通过。
- 完整 Server 期间 2545 个相关输入摘要相同，/tmp/goal-risk-decimal-inputs-before.json 与 /tmp/goal-risk-decimal-inputs-after-server.json。其后仅新测试格式和 DecimalValue 注释清理；DecimalValue 编译 JS token 比较相同，Domain 全包及 Server 新测试再次通过，/tmp/goal-risk-decimal-server-final-targeted.json。没有为格式清理重复运行完整 Server。
- 后续最终输入以 /tmp/goal-risk-decimal-inputs-final-before.json、/tmp/goal-risk-decimal-desktop-final-before.json 和 /tmp/goal-risk-decimal-mobile-final-before.json 为基线。

## 验收边界

真实业务数据、历史消息和其他共享工作区改动保持。没有执行 Docker、远程来源、模型或通知投递，没有原生工程改动。浏览器受控输入与目标运行态部署是不同证据；本轮只承担规格内的受控真实浏览器复核。

## 最终构建与门禁

| 检查 | 结果与输入 |
| --- | --- |
| Node 24 实际数值执行 | 2 文件 / 35 项通过，/tmp/goal-risk-decimal-node24.json |
| Desktop 完整包 | 240 文件 / 1389 项通过，/tmp/goal-risk-decimal-desktop-full.json |
| Mobile 完整包 | 按仓库 test 目录收集，48 文件 / 193 项通过，/tmp/goal-risk-decimal-mobile-final.json |
| Domain、Server、Desktop、Mobile 构建 | 全部通过，/tmp/goal-risk-decimal-{domain-final,server,desktop,mobile}-build.log |
| 定向 ESLint | 9 个改动文件通过；格式清理后 3 个新测试再通过，/tmp/goal-risk-decimal-lint.log、/tmp/goal-risk-decimal-lint-format-final.log |
| Prettier | 9 个改动文件通过，/tmp/goal-risk-decimal-prettier-final.log |
| 依赖边界 | 通过，/tmp/goal-risk-decimal-boundaries.log；新增 DecimalValue 和风险格式化不依赖应用或 API 适配层的约束 |
| 工作区依赖 | 8 个包通过，/tmp/goal-risk-decimal-dependencies.log |
| 尺寸 ratchet | 通过，6 个既有债务警告未增长，/tmp/goal-risk-decimal-sizes.log |

Desktop 仍有既有约 2.85 MB 主 chunk 提示，不作为本轮已解决问题。Mobile 未修改原生依赖或配置，构建指 TypeScript，没有 Native compile 结论。Mobile 首次直接 Vitest 命令漏带原脚本的 --dir test，收集到独立 Node 脚本后已停止；该次不计入结果，正式结果使用上述正确范围。

## 真实浏览器复核

复用维护入口 apps/desktop/scripts/check-risk-threshold-precision.cjs，连接既有 127.0.0.1:5173 受控页面。1440、1024、768、390 四宽各覆盖 thirds、tiny、minimum、failure，共 16 组通过。

检查实际编辑器的原阈值提交、只改严重级别、焦点往返、取消、失败保稿、非零下溢拒绝、预览、滚动和边界。领域格式化改为唯一实现后，1e-9 比例预览仍为 1E-7%，Number.MIN_VALUE 不显示为零。实际查看 390 宽截图，字段、预览和页脚操作均可读可达，没有横向溢出。

结果为 /tmp/goal-risk-decimal-browser/results.json，截图同目录。页面错误 0、业务请求 0、真实业务写入 0。

## 最终输入与一致性复核

最终 2545 个 Server/领域输入、1936 个 Desktop/共享输入和 265 个 Mobile 输入在客户端完整包、构建及浏览器前后均一致；对应 /tmp/goal-risk-decimal-*-final-before.json 与 *-final-after.json。完整 Server 的运行输入和后续纯格式清理范围见前文，保持精确复用边界。

已核对 AC1～AC5：有限数值入口、严格和包含比较、极小正价格与 100% 损失边界、权重选择/合并/缺失/容差、新消息非零展示、旧消息冻结、构建及四宽浏览器均有对应证据。本主题无剩余实施义务，Task 归档；当前记录继续为活动任务提供本次共享集成证据。

本轮 12 份改动文档的 210 个本地链接均存在，/tmp/goal-risk-decimal-doc-links.json；门禁与浏览器维护入口摘要另存 /tmp/goal-risk-decimal-extra-inputs.json。

后续共享包级检查点由[双端比例记录](2026-11-07-ratio-percent-display.md#定向与完整包结果)承接；本记录保留原验收输入，随闭合任务归档。
