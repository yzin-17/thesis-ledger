FROM node:24-alpine AS build
ENV CI=true
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

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY --from=build /workspace /app
CMD ["node", "apps/server/dist/src/main.js"]
