# APIForge Docker 构建与推送

官方镜像发布在阿里云 ACR（个人版），Docker Hub 作为备选源。

```text
主源：crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge
备选：foehao09/apiforge
```

## 1. 多架构构建并推送

### 1.1 前置条件

1. 安装 Docker Desktop（已内置 buildx）
2. 登录目标仓库：

```bash
docker login --username=<阿里云账号> \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com
```

ACR 的登录密码是控制台里设置的**仓库密码**，不是阿里云账号登录密码。

### 1.2 修改版本号

镜像 tag 与 `package.json` 的 `version` 必须一致，脚本会校验，不一致直接报错。发布前先升版本：

```bash
npm version 2.0.2 --no-git-tag-version   # 只改 package.json / package-lock.json，不建 git tag
npm run sync:env                         # 同步 .env 的 VERSION_LATEST
```

版本号选择：修复类改动升 patch 位，新增功能升 minor 位。**不要复用已发布过的版本号**——同名 tag 内容变化会让镜像缓存和回滚都不可靠。

### 1.3 一键推送

```bash
REGISTRY=crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax \
  ./scripts/docker-push.sh
```

脚本会：

1. 把 `VERSION_LATEST` 同步进 `.env`
2. **校验推送权限**（几秒内完成，避免多架构构建跑完才在 push 阶段失败）
3. 构建 `linux/amd64` + `linux/arm64` 并推送 `latest` 与版本号两个 tag

也可以同时推 Docker Hub（需先 `docker login`，且该账号对仓库有写权限）：

```bash
REGISTRY=crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax \
  ./scripts/docker-push.sh <dockerhub用户名>
```

指定 tag 时同样要与 `package.json` 一致：

```bash
REGISTRY=... ./scripts/docker-push.sh 2.0.2
```

### 1.4 仓库地址必须写全

`REGISTRY` 要写到「registry 主机 + 命名空间」为止。只写命名空间（`freyax` 或 `freyax/apiforge`）会被 Docker 当成 Docker Hub 的仓库，推送时报：

```text
push access denied, repository does not exist or may require authorization:
server message: insufficient_scope: authorization failed
```

脚本已加参数防呆：这类写法会直接拦下并提示正确格式。需要单独验证权限时：

```bash
node scripts/check-registry-push.js \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge
```

输出 `[✓] ... 具备 push 权限` 表示凭据可用；`[✗]` 会说明是账号无权限还是凭据过期。

### 1.5 手动构建命令

```bash
docker buildx create --name m1-builder --use   # 首次

docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --build-arg DOCKER_IMAGE=crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest \
  --build-arg VERSION=2.0.2 \
  --provenance=false --sbom=false \
  --output type=image,push=true,oci-mediatypes=false \
  -t crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest \
  -t crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:2.0.2 \
  .
```

`--provenance=false --sbom=false --oci-mediatypes=false` 三个参数不能省：ACR 个人版不认识 BuildKit 附加的证明描述符，会报
`unknown manifest class for application/vnd.oci.empty.v1+json`。

### 1.6 支持的架构

| 平台 | 说明 |
| --- | --- |
| linux/amd64 | x86_64（Intel/AMD 服务器、常见 PC） |
| linux/arm64 | ARM64（Apple M1/M2、树莓派 4、部分云服务器） |

镜像为多架构 manifest list，拉取时自动匹配当前机器架构。

## 2. 运行官方镜像

### 2.1 拉取

```bash
docker pull crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

仓库是公开的，读取不需要登录；推送到私有仓库时才需要 `docker login`。

### 2.2 启动容器（推荐）

```bash
docker run -d \
  --name apiforge \
  --restart unless-stopped \
  -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -v apiforge-data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

访问 `http://localhost:3000`。

| 参数 | 作用 |
| --- | --- |
| `--name apiforge` | 页面内一键更新依赖该容器名，不能随意修改 |
| `-p 3000:3000` | Web 服务端口 |
| `-v apiforge-data:/app/data` | 持久化 SQLite 数据库，重建容器时必须沿用 |
| `-v /var/run/docker.sock:/var/run/docker.sock` | 允许容器调用宿主机 Docker，页面一键更新需要 |
| `--add-host host.docker.internal:host-gateway` | 允许容器访问宿主机上的服务 |

不需要页面内「系统更新」按钮时，可以去掉 Docker socket 挂载，降低容器权限：

```bash
docker run -d \
  --name apiforge \
  --restart unless-stopped \
  -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -v apiforge-data:/app/data \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

此时升级需要手动拉取镜像并重建容器，见第 4.3 节。

### 2.3 使用 PostgreSQL

```bash
docker run -d \
  --name apiforge \
  --restart unless-stopped \
  -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -e DB_TYPE=postgres \
  -e DB_HOST=host.docker.internal \
  -e DB_PORT=5432 \
  -e DB_USERNAME=postgres \
  -e DB_PASSWORD=yourpassword \
  -e DB_DATABASE=apiforge \
  -v /var/run/docker.sock:/var/run/docker.sock \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

## 3. 数据卷

数据卷里是 SQLite 数据库，**卷名必须固定为 `apiforge-data`**。

### 3.1 用 docker compose 部署

`docker-compose.yml` 里的卷定义必须显式写 `name`：

```yaml
volumes:
  apiforge-data:
    name: apiforge-data
```

不写 `name` 时 compose 会按项目名（目录名）加前缀，实际生成 `apiforge_apiforge-data`。换目录名或换机器部署时会挂到一个全新的空卷上，应用随即初始化空库，表现为「数据丢失」。改完用下面的命令确认解析结果：

```bash
docker compose config | sed -n '/^volumes:/,$p'
# volumes:
#   apiforge-data:
#     name: apiforge-data
```

`docker compose up` 若提示
`volume "apiforge-data" already exists but was not created by Docker Compose`，
说明卷是之前手工创建的，缺少 compose 标签，属正常复用提示，不影响数据。不要为了消除它改成 `external: true`——全新克隆时卷不存在会直接启动失败。

### 3.2 备份与迁移

```bash
IMG=crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest

# 备份
docker run --rm -v apiforge-data:/data -v "$PWD":/backup $IMG \
  tar czf /backup/apiforge-data.tgz -C /data .

# 恢复（先停容器）
docker run --rm -v apiforge-data:/data -v "$PWD":/backup $IMG \
  sh -c 'cd /data && tar xzf /backup/apiforge-data.tgz'
```

## 4. 更新

### 4.1 更新策略：latest 镜像摘要（默认）

默认不比较版本号，而是比较远端 `:latest` 的 manifest 摘要与当前运行镜像的 `RepoDigest`，摘要变化即提示更新，更新时固定拉取 `:latest`。

发布新镜像时同时打 `latest` 和版本 tag，两种模式都能工作。需要恢复语义化版本比较时：

```bash
-e UPDATE_TRACK=version
```

### 4.2 一键更新做了什么

点击页面更新后，后端会：

1. 拉取目标镜像（主源失败时自动尝试 `DOCKER_IMAGE_MIRRORS` 里的备选源）
2. 启动一个临时助手容器 `apiforge-updater`，由它改名并停止旧容器
3. 用新镜像按原容器的环境变量、端口、挂载、网络重建容器
4. 删除旧容器；创建失败时自动回滚到旧容器，服务不会消失

更新会保留原容器的全部环境变量（数据库配置、密钥等），只覆盖 `DOCKER_IMAGE` 与 `DOCKER_DATA_VOLUME`。

### 4.3 手动升级

`docker pull` 只下载镜像，不会替换正在运行的容器：

```bash
docker pull crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
docker stop apiforge
docker rm apiforge

# 重新执行第 2.2 节的 docker run 命令，数据卷 apiforge-data 不变
```

### 4.4 一键更新排查

失败时页面会直接给出原因，先看提示。仍无头绪时按顺序检查：

```bash
# 1. 助手容器日志（保留在容器里，不会自动删除）
docker logs apiforge-updater

# 2. 更新过程日志（写在数据卷里，容器重建后仍可查）
docker exec apiforge tail -n 40 /app/data/update.log

# 3. 确认当前容器实际使用的镜像
docker inspect apiforge --format '{{.Image}} {{.Config.Image}}'
```

常见情况：

| 现象 | 原因与处理 |
| --- | --- |
| 提示「无法连接 Docker」 | 容器启动时没挂 `-v /var/run/docker.sock:/var/run/docker.sock`，需重建容器补上 |
| 镜像下载了但容器没变 | 看 `update.log` 里 `[update] create failed` 那一行；常见是端口被占用或挂载冲突 |
| 提示 `Duplicate mount point` | 旧版本缺陷，升级到 2.0.1 及以上版本 |
| 提示 `insufficient_scope` | 拉取的是私有仓库但没有配置 `DOCKER_REGISTRY_USERNAME/PASSWORD` |
| 更新后 `docker compose up` 报容器名冲突 | 2.0.1 之前的缺陷（重建的容器没带 compose 标签）。升级后不再出现；临时处理：`docker rm -f apiforge && docker compose up -d` |

### 4.5 私有仓库的自动更新凭据

镜像来自私有仓库且希望页面内自动更新时，容器内还需要仓库凭据：

```bash
docker run -d \
  --name apiforge \
  --restart unless-stopped \
  -p 3000:3000 \
  --add-host host.docker.internal:host-gateway \
  -v apiforge-data:/app/data \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e DOCKER_REGISTRY_USERNAME=<阿里云账号> \
  -e DOCKER_REGISTRY_PASSWORD=<仓库密码> \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

官方镜像所在的 ACR 仓库为公开仓库，不需要这两个变量。

## 5. 仅构建本地架构

只需当前机器架构时，用普通构建：

```bash
docker build -t apiforge:latest .
```

本地构建的镜像没有 registry 摘要，页面会回退到版本号比较，不会误报「有新版本」。
