# G3 原免费模型正式 SDK 验收

## 当前执行包

用户继续使用 openrouter/free 修复；D19 已在同一请求体、相同实际模型且保留推理时返回 stop／完整 JSON／V2，通过证据复用。原失败结束原因未知，不为此修改解析器、输出方式或默认，不重试历史请求。

本叶回到 600519.SH、shadow、recent-changes 的正式提交入口，生成新 submissionId，默认修订仍为 5；本阶段最多 1 次真实调用、总费用 0 元，共用剩余 9 次。受控策略 maxAiCalls=1、maxInputTokens=100000、maxOutputTokens=20000、maxDurationSeconds=300、maxCost=0、paidRoutes=[]。保留推理默认、所有原用途及证明、来源启停与 20 条数据路由。

依次通过原输入／17 个已验源码指纹与目标状态预检，使用 infra 的官方保留数据 update.sh thesis-ledger 临时开启 V2；通过正式 research/submissions 提交，反读唯一调用、报告／引用／历史；最后同一官方入口恢复原 V2=false 与原策略。旧 AI 和保护表按已确认的原记录保留、正常追加与业务投影更新边界核对。失败或新卡点立即停止采样，先完成关闭恢复，不自动重试。

当前仅本地预检阶段，未开启 V2、未提交 G3。源码／依赖／数据库结构没有本轮改动，已通过且输入不变的本地门禁继续复用，不重跑全包。直连不能替代本次正式业务验收。

## 官方更新失败与停止检查点

17 个已验源码指纹与当前默认／用途预检均通过，默认仍 openrouter/free、修订 5，原用途证明有效。随后从 /Users/yzin/code/thesis-ledger-workspace/thesis-ledger-infra 执行官方 ./scripts/update.sh thesis-ledger，由既有守卫传入 DEV_DATABASE_MODE=check、UPDATE_SPACE_MODE=auto、REPAIR_BUILD_CACHE_ON_NO_SPACE=false 及受控 V2／单次零费用策略；未改应用源码、用途或默认。

更新在 build 19/19 的 pnpm deploy 阶段失败：ERR_PNPM_EROFS，随后 BuildKit 的 /var/lib/docker/buildkit/containerd-overlayfs/metadata_v2.db 报 read-only file system。守卫在首次明确错误后终止本次进程组 90013，退出 143／SIGTERM，阻止自动重试；未进入目标部署或正式 G3 提交。日志为 /tmp/thesis-ledger-g3-reasoning-enable-1792843040737.log。

同时主机临时目录曾报 ENOSPC；停止后的只读 df 显示可用空间约 116 MiB。只读 Docker inspect 失败，目标 research/capabilities 请求也不可达，无法做更新后的保护、环境或 V2 最终复核。最后已确认的原状态为 V2=false、canCreate=false；不能把该旧基线说成当前已确认关闭。

本阶段没有提交研究、没有模型调用，仍为 0/1，共用剩余 9 次冻结；之前 D19 的 JSON／V2 通过及上游费用 0 USD 保留。原行和控制表在 D19 后、本次更新前已全部核对保持；本轮更新后的完整核对未完成，不能勾选。

新的卡点为主机空间和 Docker 构建存储。已停止，不清理或重启、不重跑更新、不调用模型。需用户恢复空间与 Docker 可写后，先核实或恢复 V2 关闭，再按原参数接续同一保留数据更新和一次 G3；复用 D19，不再发送原样直连。
