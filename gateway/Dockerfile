FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npx nest build

FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
# Pre-fetch the filesystem MCP server into the npx cache so startup doesn't download it.
RUN npx -y -p @modelcontextprotocol/server-filesystem true
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY toollock.config.json ./
RUN mkdir -p sandbox
EXPOSE 3000
# Apply pending migrations, then serve /mcp and /api on PORT.
CMD ["sh", "-c", "node dist/main.js migrate && exec node dist/main.js"]
