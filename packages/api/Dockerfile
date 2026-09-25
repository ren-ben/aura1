FROM node:22-alpine
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/api/package.json packages/api/
COPY packages/web/package.json packages/web/
RUN pnpm install --frozen-lockfile

COPY packages/shared packages/shared
COPY packages/api packages/api
COPY packages/web packages/web
RUN pnpm --filter @aura/web build

WORKDIR /app/packages/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm db:seed && exec pnpm start"]
