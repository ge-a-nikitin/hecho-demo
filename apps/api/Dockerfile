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

# The API runs as the unprivileged `node` user: a dependency that turns into
# code execution gets neither the root-writable files of the container nor the
# ability to modify the image. Nothing is written at run time — multer keeps
# uploads in memory, the invoice PDF is rendered in memory and Prisma only reads
# its schema — so compose can hand the service a read-only root filesystem.
USER node

# `pnpm` is deliberately absent from the run-time command: corepack resolves the
# package manager through a cache under $HOME, which a read-only root filesystem
# does not provide, and the two steps below are all the container needs. The
# local binary and `dist/main.js` mirror the `db:migrate:deploy` and `start`
# scripts of apps/api/package.json.
CMD ["sh", "-c", "cd apps/api && ./node_modules/.bin/prisma migrate deploy && exec node dist/main.js"]
