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

# 从构建阶段复制依赖（避免最终阶段再次拉取，规避网络问题）
COPY package*.json ./
COPY --from=backend-builder /app/node_modules ./node_modules
RUN npm prune --omit=dev

# 复制后端构建产物
COPY --from=backend-builder /app/dist ./dist

# 复制文档（文档教程页面用）
COPY docs/README.md ./README.md
COPY docs/image ./image

# 复制前端构建产物到 frontend/dist
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# 数据持久化目录（SQLite 数据库）
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV DB_TYPE=sqlite
ENV DB_SQLITE_PATH=/app/data/apiforge.db
ENV PORT=3000

EXPOSE 3000

CMD ["node", "dist/main.js"]
