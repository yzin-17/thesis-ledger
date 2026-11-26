ARG NODE_IMAGE=node:24-alpine
FROM ${NODE_IMAGE} AS build
ARG NPM_REGISTRY=https://registry.npmmirror.com
ARG NODE_DIST_URL=https://npmmirror.com/mirrors/node
ARG ALPINE_MIRROR=https://dl-cdn.alpinelinux.org/alpine
ENV CI=true
ENV COREPACK_NPM_REGISTRY=${NPM_REGISTRY} \
    pnpm_config_registry=${NPM_REGISTRY} \
    npm_config_registry=${NPM_REGISTRY} \
    npm_config_disturl=${NODE_DIST_URL}
RUN sed -i "s|https://dl-cdn.alpinelinux.org/alpine|${ALPINE_MIRROR}|g" /etc/apk/repositories \
    && apk add --no-cache g++ make python3
RUN npm install --global pnpm@latest
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/package.json
COPY apps/desktop/package.json apps/desktop/package.json
COPY apps/mobile/package.json apps/mobile/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY services/dsa-adapter/package.json services/dsa-adapter/package.json
COPY patches ./patches
RUN --mount=type=cache,id=thesis-ledger-pnpm-store,target=/pnpm/store,sharing=locked \
    pnpm --store-dir /pnpm/store --filter thesis-ledger --filter @thesis-ledger/server... install --frozen-lockfile
COPY . .
RUN --mount=type=cache,id=thesis-ledger-prisma-engines,target=/root/.cache/prisma,sharing=locked \
    pnpm --filter @thesis-ledger/server exec prisma generate
RUN NODE_OPTIONS=--max-old-space-size=4096 pnpm --filter @thesis-ledger/server... build
# 此处只安装 Server 生产依赖，工作区的移动端补丁在该子集中没有目标包。
RUN --mount=type=cache,id=thesis-ledger-pnpm-store,target=/pnpm/store,sharing=locked \
    PNPM_CONFIG_ALLOW_UNUSED_PATCHES=true pnpm --filter @thesis-ledger/server deploy --prod /tmp/server-runtime --legacy

FROM ${NODE_IMAGE} AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S thesis && adduser -S thesis -G thesis
COPY --from=build /tmp/server-runtime ./
COPY --from=build /workspace/apps/server/dist ./apps/server/dist
# pnpm deploy 不会携带 workspace 构建阶段生成的 Prisma Client；在最终运行时目录重新生成。
RUN --mount=type=cache,id=thesis-ledger-prisma-engines,target=/root/.cache/prisma,sharing=locked \
    ./node_modules/.bin/prisma generate --schema=/app/prisma/schema.prisma
# 保留 Prisma CLI 和生成客户端，供受控结构检查使用。
RUN test -x /app/node_modules/.bin/prisma
# V2 Snapshot/Artifact 默认写入 /app/var/backtest；提前交给非 root 运行用户。
RUN mkdir -p /app/var/backtest && chown -R thesis:thesis /app/var
USER thesis
CMD ["node", "apps/server/dist/src/main.js"]
