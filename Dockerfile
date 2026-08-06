# 构建 Next.js 前端产物。
FROM oven/bun:1.3.13 AS web-build

WORKDIR /app/web
COPY web/package.json web/bun.lock ./
COPY web/patches ./patches
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile --registry=https://registry.npmmirror.com --cache-dir=/root/.bun/install/cache
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY web/next.config.ts ./
COPY web/tsconfig.json ./
COPY web/postcss.config.mjs ./
COPY web/tailwind.config.js ./
COPY web/eslint.config.mjs ./
COPY web/components.json ./
COPY web/next-env.d.ts ./
COPY web/public ./public
COPY web/scripts ./scripts
COPY web/styles ./styles
COPY web/components ./components
COPY web/src ./src
RUN bun run build

# 构建 Go 后端入口。
FROM golang:1.25-alpine AS api-build

WORKDIR /app
ENV GOPROXY=https://proxy.golang.com.cn,https://goproxy.cn,direct
COPY go.mod go.sum ./
COPY config ./config
COPY handler ./handler
COPY middleware ./middleware
COPY model ./model
COPY repository ./repository
COPY router ./router
COPY service ./service
COPY main.go ./
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    go build -o /server .

# 下载并校验官方 Dreamina CLI。固定哈希可避免上游浮动文件被静默带入生产镜像。
FROM node:22-bookworm-slim AS dreamina-build

ARG TARGETARCH
ARG DREAMINA_CLI_BASE=https://lf3-static.bytednsdoc.com/obj/eden-cn/psj_hupthlyk/ljhwZthlaukjlkulzlp/dreamina_cli_beta
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && case "$TARGETARCH" in \
        amd64) dreamina_file=dreamina_cli_linux_amd64; dreamina_sha=7c2817bc844e5a93cc5c6e57f876ccaea91d438e520ad50f665a515e816c7dc6 ;; \
        arm64) dreamina_file=dreamina_cli_linux_arm64; dreamina_sha=696216eee0fe55ba5e5d781429a3eb304cfdb539823397742a4d1a7575ab1202 ;; \
        *) echo "Unsupported Dreamina CLI architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
    && curl -fsSL "$DREAMINA_CLI_BASE/$dreamina_file" -o /usr/local/bin/dreamina \
    && echo "$dreamina_sha  /usr/local/bin/dreamina" | sha256sum -c - \
    && chmod 0755 /usr/local/bin/dreamina \
    && /usr/local/bin/dreamina version

# 运行镜像：Next.js 对外监听 3000，Go 只在容器内部监听 8080。
FROM node:22-bookworm-slim

WORKDIR /app
COPY VERSION /app/VERSION
COPY CHANGELOG.md /app/CHANGELOG.md
COPY --from=api-build /server /app/server
COPY --from=web-build /app/web /app/web
COPY --from=dreamina-build /usr/local/bin/dreamina /usr/local/bin/dreamina
COPY --from=dreamina-build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY docker-entrypoint.mjs /app/docker-entrypoint.mjs
ENV GIN_MODE=release
ENV NODE_ENV=production
ENV PROMPT_DATA_DIR=/app/data/prompts
ENV DREAMINA_HOME=/app/data/dreamina-home
ENV DREAMINA_OUTPUT_DIR=/app/data/jimeng-cli
RUN mkdir -p /app/data/prompts /app/data/dreamina-home /app/data/jimeng-cli

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then((res)=>process.exit(res.ok?0:1)).catch(()=>process.exit(1))"]
# 同时管理内部 Go API 和 Next.js；任一进程退出时容器退出，避免后端挂掉但页面容器仍显示存活。
CMD ["node", "/app/docker-entrypoint.mjs"]
