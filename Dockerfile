# 构建 Next.js 前端产物。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --registry=https://registry.npmmirror.com --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web ./
RUN bun run build

# 构建 Go 后端入口。
FROM golang:1.25-alpine AS api-build

WORKDIR /app
COPY go.mod go.sum ./
COPY config ./config
COPY handler ./handler
COPY middleware ./middleware
COPY model ./model
COPY repository ./repository
COPY router ./router
COPY service ./service
COPY main.go ./
RUN go build -o /server .

# 运行镜像：Next.js 对外监听 3000，Go 只在容器内部监听 8080。
FROM node:22-bookworm-slim

WORKDIR /app
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY --from=api-build /server /app/server
COPY --from=web-build /app/web /app/web
COPY docker-entrypoint.mjs /app/docker-entrypoint.mjs
ENV PROMPT_DATA_DIR=/app/data/prompts
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
RUN mkdir -p /app/data/prompts

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"]
# 同时管理内部 Go API 和 Next.js；任一进程退出时容器退出，避免后端挂掉但页面容器仍显示存活。
CMD ["node", "/app/docker-entrypoint.mjs"]
