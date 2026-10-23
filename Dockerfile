# APIForge - 多阶段构建
# 使用 Debian slim 以兼容 sqlite3 原生模块
# 阶段 1: 构建前端
FROM node:20-slim AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# 阶段 2: 构建后端
FROM node:20-slim AS backend-builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build

# 阶段 3: 运行镜像
FROM node:20-slim
WORKDIR /app

# 压测引擎 Locust（Python）。默认走国内镜像，可用 --build-arg 覆盖：
#   DEBIAN_MIRROR / PYPI_INDEX / LOCUST_VERSION
ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn
ARG PYPI_INDEX=https://mirrors.aliyun.com/pypi/simple/
ARG LOCUST_VERSION=2.47.0
RUN sed -i "s|deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources /etc/apt/sources.list 2>/dev/null || true \
    && apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip \
    && pip3 install --break-system-packages --no-cache-dir -i "${PYPI_INDEX}" "locust==${LOCUST_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段复制依赖（避免最终阶段再次拉取，规避网络问题）
COPY package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

# 复制后端构建产物
COPY --from=backend-builder /app/dist ./dist
# Locust 脚本不是 TS 产物，需要单独复制
COPY --from=backend-builder /app/src/modules/test/locust_runner.py ./dist/modules/test/locust_runner.py

# 复制文档（文档教程页面用）
COPY docs/README.md ./docs/README.md
COPY docs/image ./docs/image

# 复制前端构建产物到 frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 数据持久化目录（SQLite 数据库）
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV TZ=Asia/Shanghai
ENV LANG=C.UTF-8
ENV DB_TYPE=sqlite
ENV DB_SQLITE_PATH=/app/data/apiforge.db
ENV PORT=3000
# 版本检测依赖此变量从 Docker Hub API 获取最新 tag（需含 namespace/repo 如 foehao09/apiforge）
ARG DOCKER_IMAGE=foehao09/apiforge:1.0.0
ARG VERSION=1.0.0
LABEL org.opencontainers.image.version="${VERSION}"
ENV DOCKER_IMAGE=${DOCKER_IMAGE}

EXPOSE 3000

CMD ["node", "dist/main.js"]
