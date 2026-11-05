FROM node:22-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@12.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile

COPY . .

ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN pnpm --filter @order-desk/api db:generate \
    && pnpm --filter @order-desk/api build

EXPOSE 6201

CMD ["sh", "-c", "pnpm --filter @order-desk/api db:migrate:deploy && pnpm --filter @order-desk/api start"]
