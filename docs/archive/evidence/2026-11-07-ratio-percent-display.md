# 双端只读比例展示验证记录

对应[规格](../../specs/2026-11-07-ratio-percent-display.md)与[任务](../tasks/2026-11-07-ratio-percent-display.md)。

## 当前结论

本轮共享比例合同及两个首批入口完成验收。Domain 565 项、Desktop 1415 项、Mobile 206 项完整回归通过；构建、适用门禁与四宽 36 组实际组件浏览器通过。相同展示问题的其他消费者由后续有界任务继续排查，全线程 Goal 保持执行。

## 原始反例与修复

- Domain 新增合同初始 20 项失败，/tmp/goal-ratio-domain-before.json；旧代码没有统一展示导出。
- Desktop 实际 AllocationWeight 初始 13 项中 8 通过、5 失败，/tmp/goal-ratio-desktop-before.json。
- Mobile 实际 displayRatio 初始 13 项中 5 通过、8 失败，/tmp/goal-ratio-mobile-before.json。
- 原例包括极小值显示 0.00%、负值显示负零、0.01005 显示 1.00%，以及最大有限值乘 100 后显示 Infinity%。
- 共享合同先复用十进制文本单位转换，再由 Intl 展示。普通值固定两位，极小非零和绝对比例达到 1e19 的值使用最多 6 位小数的科学计数；巨大百分比整数通过 BigInt 格式化，避免浮点溢出。原始值、计算及提交均未改变。
- 首次接入发现包入口漏导出，按真实双端定向失败补齐后通过；该次中间结果不作为最终验收。

## 消费者与保留语义

Desktop 原可用性条件、DOM 和进度条边界保留：负值与超过 100% 的值只显示实际数字，0～100% 继续使用进度条。Mobile 保留 displayRatio 导出，PerformanceResults 中收益、披露覆盖、定价覆盖、权重、目标共用该合同，查询、筛选和目标配置没有改动。

本轮全局搜索还确认收益、风险上下文、组合及行情有其他独立格式化入口；这不扩大本记录两个首批消费者的验收范围，继续由下一有界任务处理。历史冻结文案、不同小数位的业务摘要及输入原值需分别核对，不能直接全局替换。

## 定向与完整包结果

| 检查 | 结果与原始证据 |
| --- | --- |
| Domain 相关定向 | 4 文件 / 64 项通过，/tmp/goal-ratio-domain-targeted.json |
| 双端接入定向 | Desktop 3 文件 / 48 项、Mobile 2 文件 / 20 项通过，/tmp/goal-ratio-desktop-targeted-final.json、/tmp/goal-ratio-mobile-targeted-final.json |
| Node 24 运行时 | 20 项通过，/tmp/goal-ratio-node24-final.json |
| Domain 完整包 | 59 文件 / 565 项通过，/tmp/goal-ratio-domain-full.json |
| Desktop 完整包 | 242 文件 / 1415 项通过，/tmp/goal-ratio-desktop-full.json |
| Mobile 完整包 | 49 文件 / 206 项通过，/tmp/goal-ratio-mobile-full.json |
| 构建 | Domain、Server、Desktop、Mobile 通过，/tmp/goal-ratio-domain-build-final.log、/tmp/goal-ratio-server-build.log、/tmp/goal-ratio-desktop-build.log、/tmp/goal-ratio-mobile-build.log |
| ESLint | 11 个 TypeScript 文件退出 0，/tmp/goal-ratio-lint-final.log；原生包的 Flow 解析诊断保留在日志，不能据此声称原生依赖内部检查完成 |
| 格式与维护脚本 | 15 文件格式通过，/tmp/goal-ratio-prettier-final.log；CJS 和验收配置通过 Node --check，并实际执行 |
| 依赖边界与工作区 | 通过，8 个包依赖图通过，/tmp/goal-ratio-boundaries-final.log、/tmp/goal-ratio-dependencies-final.log |
| 尺寸约束 | 6 个既有警告未增长，ratchet 通过，/tmp/goal-ratio-sizes-final.log |

Mobile 按现有 test 脚本范围执行 --dir test --passWithNoTests；使用 exec vitest run 传递过滤参数。新展示函数没有 Server 消费，不重复其完整包；此前服务端完整验收继续只覆盖其原输入。

## 真实浏览器与入口所有权

维护入口 apps/desktop/scripts/check-ratio-percent-display.cjs，通过 test/ratio-display.vite.config.mjs 启动单独 127.0.0.1:5181 服务。四宽 1440、1024、768、390 各覆盖普通、临界舍入、极小正数、极小负数、最小非零、最大有限值、超过 100%、零和不可用，共 36 组，每组分别加载 Desktop 和 Mobile 两个实际页面。

实际检查 Desktop 可见百分比、进度条存在与标签；Mobile 检查六类比例文本及“显示更多收益明细”操作；两端分别检查容器与页面溢出。最终 /tmp/goal-ratio-browser-acceptance/results.json：36 组通过、页面错误 0、业务请求 0、真实业务写入 0。截图同目录，实际查看最大值 Mobile 和负权重 Desktop 的 390 宽截图，文本完整、边界正常。

首次文本检查误计入 Base UI 隐藏测量文本；改为定位实际可见百分比。原复合样本的跨应用 import 被边界门禁拒绝后，样本分别回到 apps/desktop/test 与 apps/mobile/test。最终两个独立页面由验收配置加载，不增加跨应用源码依赖，也未放宽门禁。独立页面曾因 Vite React 初始化及 RN Web 不转发任意 data 属性而失败，修复入口和定位容器后重跑最终矩阵；旧矩阵不替代最终入口结果。

Mobile 使用现有 react-native-web 渲染真实 PerformanceResults、MobilePrimitives 与刷新容器。替身仅提供实际主题，并隔离原生 WebView 图表容器，以便覆盖同一行的披露与定价文本；不提供任何收益或比例展示逻辑。这是受控浏览器组件验收，未执行原生编译、真实行情、Docker 或部署。自行启动的 5181 服务与浏览器均已关闭；既有 5173 服务未改动。

## 最终一致性复核

2547 个 Server/共享输入在完整包、构建与浏览器前后相同，/tmp/goal-ratio-shared-inputs-before.json、/tmp/goal-ratio-shared-inputs-final.json。Desktop 与 Mobile 的输入变化只涉及验收样本归属、独立 HTML 和定位容器；产品源码、实际测试与已构建依赖未变，因此复用完整包结果，不为样本移动重复执行完整包。

最终输入：Desktop 1944 项、Mobile 269 项，/tmp/goal-ratio-desktop-inputs-final.json、/tmp/goal-ratio-mobile-inputs-final.json；产品与脚本摘要另存 /tmp/goal-ratio-final-product-inputs.json、/tmp/goal-ratio-extra-inputs-final.json。AC1～AC5 均有对应结果，Task 可归档；本记录供活动任务引用最新双端包级证据。
