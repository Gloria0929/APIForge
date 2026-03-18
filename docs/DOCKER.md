# APIForge Docker 构建与推送

## 多架构构建（ARM + x86）并推送到 Docker Hub

### 前置条件

1. 安装 Docker Desktop（已内置 buildx）
2. 登录 Docker Hub：`docker login`

### 一键构建并推送

```bash
# 替换 YOUR_DOCKERHUB_USERNAME 为你的 Docker Hub 用户名
./scripts/docker-push.sh YOUR_DOCKERHUB_USERNAME

# 指定标签（默认 latest）
./scripts/docker-push.sh YOUR_DOCKERHUB_USERNAME 1.0.0
```

或使用 npm：

```bash
npm run docker:push -- YOUR_DOCKERHUB_USERNAME 1.0.0
```

### 手动命令

```bash
# 1. 创建 buildx builder（首次）
docker buildx create --name m1-builder --use

# 2. 多架构构建并推送
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t YOUR_DOCKERHUB_USERNAME/apiforge:latest \
  --push \
  .
```

### 支持的架构

| 平台        | 说明                                         |
| ----------- | -------------------------------------------- |
| linux/amd64 | x86_64（Intel/AMD 服务器、常见 PC）          |
| linux/arm64 | ARM64（Apple M1/M2、树莓派 4、部分云服务器） |

### 拉取镜像

用户拉取时会自动匹配当前机器架构：

```bash
docker pull YOUR_DOCKERHUB_USERNAME/apiforge:latest
```

### 运行镜像

**基础运行**（数据不持久化，容器删除后数据丢失）：

```bash
docker run -d -p 3000:3000 YOUR_DOCKERHUB_USERNAME/apiforge:latest
```

**推荐：挂载数据卷**（SQLite 数据库持久化）：

```bash
docker run -d -p 3000:3000 \
  -v apiforge-data:/app/data \
  --name apiforge \
  YOUR_DOCKERHUB_USERNAME/apiforge:latest
```

**自定义端口**（例如映射到 8080）：

```bash
docker run -d -p 8080:3000 \
  -v apiforge-data:/app/data \
  --name apiforge \
  YOUR_DOCKERHUB_USERNAME/apiforge:latest
```

**使用 PostgreSQL**（需先启动 PostgreSQL 容器）：

```bash
docker run -d -p 3000:3000 \
  -e DB_TYPE=postgres \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_USERNAME=postgres \
  -e DB_PASSWORD=yourpassword \
  -e DB_DATABASE=apiforge \
  --name apiforge \
  YOUR_DOCKERHUB_USERNAME/apiforge:latest
```

运行后访问：`http://localhost:3000`

### 仅构建本地架构

若只需当前机器架构，使用普通构建：

```bash
docker build -t apiforge:latest .
```
