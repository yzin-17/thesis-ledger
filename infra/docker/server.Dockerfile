FROM node:24-alpine AS build
ENV CI=true
# registry.npmjs.org 在本机网络下 TLS 握手间歇性被重置（ECONNRESET），corepack 下载
# pnpm 本体或 pnpm 拉包任何一次命中都会让构建失败；corepack 取 pnpm 与 pnpm 拉包
# 统一走 npmmirror。lockfile 只记录 integrity 摘要、不含 registry 地址，换源不影响
# --frozen-lockfile 校验。disturl 让 node-gyp（node-pty 无 arm64 prebuild，需现场
# 编译）从 npmmirror 的 node 发行版镜像取 headers，避免 nodejs.org 被重置。
ENV COREPACK_NPM_REGISTRY=https://registry.npmmirror.com \
    npm_config_registry=https://registry.npmmirror.com \
    npm_config_disturl=https://npmmirror.com/mirrors/node
RUN apk add --no-cache g++ make python3
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/server/package.json apps/server/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/schemas/package.json packages/schemas/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY patches ./patches
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @thesis-ledger/server prisma generate
RUN pnpm --filter @thesis-ledger/server... build
RUN pnpm --filter @thesis-ledger/server deploy --prod /tmp/server-runtime --legacy

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S thesis && adduser -S thesis -G thesis
COPY --from=build /tmp/server-runtime ./
COPY --from=build /workspace/apps/server/dist ./apps/server/dist
# pnpm deploy 不会携带 workspace 构建阶段生成的 Prisma Client；在最终运行时目录重新生成。
RUN ./node_modules/.bin/prisma generate --schema=/app/prisma/schema.prisma
# Compose 在启动时执行 Prisma migration；确保生产运行时保留 CLI 和生成客户端。
RUN test -x /app/node_modules/.bin/prisma
USER thesis
CMD ["node", "apps/server/dist/src/main.js"]
