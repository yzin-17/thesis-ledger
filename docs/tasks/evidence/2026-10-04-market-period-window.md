# 周期窗口规划与双层预算证据

## T3.2a 完成范围

新增 Domain `planMarketPeriodCalendarBuckets`，复用原周/月/年/5d 桶算法输出稳定计划；Server `planMarketPeriodWindow` 拥有可见范围、预热与基础日线预算。函数只消费显式日历/评估时刻，不读取系统时钟、行情、缓存或存储。

可见条数按所选周期计算，预热取同周期的前置桶；基础预算按实际计划交易日数检查，指标预算按可见请求条数加既有预热检查，两者上限各为 3650。缺历史预热保留实际桶数和可用预热数量，所选桶缺完整日历则拒绝。开始日期落在桶内时仍读取整个桶；当前桶保留完整计划结束时刻，基础读取不超过评估日期或请求结束日期。5d 读取结束绑定锚点，防止取得锚点之后的日线。

## 验证结果

- 新窗口直接测试 16 项，日历直接测试 33 项；本地定向共 49 项通过。
- 最终 Server 行情特性及 DSA Calendar/周期/旧客户端回归：56 文件、684 项通过，5 文件、27 项原有条件性跳过。
- Domain 全包 43 文件、386 项通过；Domain build、Server 类型检查、定向 lint/复杂度、边界、尺寸 ratchet 与 diff 检查通过。复杂度上限保持 20，尺寸门禁保留 9 个未增长的旧告警。
- 共享周期指标夹具可逐字节复现，SHA-256 仍为 `1e695091d17f4a8d50913572b8979eb63a391dd820f4e43e828f04138fee4cda`，原桶结果与指纹没有改变。

新增 Server 测试最初跨包 import Domain 测试源码，触发 Server `rootDir` 类型门禁；改为本包内明确标注的受控日历夹具，未放宽工程配置。窗口结束解析按语义提取，避免将主函数复杂度扩大到 22。

大范围年线场景在首次并发回归超过原 5 秒测试超时。修复了重复执行同一拒绝输入的测试，并将 Domain 的时区格式器改为每次日历计算创建两份、逐 Session 复用；未提高超时或改算法。最终完整窗口测试文件耗时约 640 毫秒，Domain 全包及共享 golden 保持一致。

临时日志为 `/tmp/market-period-window-directed.log`、`/tmp/market-period-window-server-regression.log`、`/tmp/market-period-window-domain-regression.log`、`/tmp/market-period-window-types.log`、`/tmp/market-period-window-lint-final.log`。

## 剩余范围

T3.2b 的实际基础日线读取、完整价格口径绑定与派生显示/计算序列，T3.2c 的缓存和指标投影尚未完成。`calendarHasEarlierBucket` 只是日历规划信息，不能直接作为公开 `hasMoreBefore` 的事实证明。T3.3/T5 与完整运行态门禁继续开放。

本叶没有访问行情 Provider、业务数据库或目标新公开成功路径；新规划模块尚未同步目标。先前[日历目标核验](2026-10-04-market-period-calendar.md)和[指标合同核验](2026-10-04-market-period-indicator-contract.md)分别保留各自输入版本与验证边界。
