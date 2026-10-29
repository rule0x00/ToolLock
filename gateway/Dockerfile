# Build context is the repo root (see docker-compose.yml) so the demo evil-server can be bundled.
FROM node:24-slim AS build
WORKDIR /app
COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci
COPY gateway/nest-cli.json gateway/tsconfig.json gateway/tsconfig.build.json ./
COPY gateway/src ./src
RUN npx nest build

FROM node:24-slim
ENV NODE_ENV=production
# Demo upstream, spawned over stdio as ../evil-server/src/index.ts (Node runs the TypeScript directly).
WORKDIR /evil-server
COPY evil-server/package.json evil-server/package-lock.json ./
RUN npm ci --omit=dev
COPY evil-server/src ./src

WORKDIR /app
COPY gateway/package.json gateway/package-lock.json ./
RUN npm ci --omit=dev
# Pre-fetch the filesystem MCP server into the npx cache so startup doesn't download it.
RUN npx -y -p @modelcontextprotocol/server-filesystem true
COPY --from=build /app/dist ./dist
COPY gateway/migrations ./migrations
COPY gateway/toollock.config.json ./
RUN mkdir -p sandbox lock
EXPOSE 3000
# Apply pending migrations, then serve /mcp and /api on PORT.
CMD ["sh", "-c", "node dist/main.js migrate && exec node dist/main.js"]
