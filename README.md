# APIForge

> AI 自动化 API 测试与文档一体化平台

APIForge 是一个现代化的 API 测试平台，集成了 AI 能力，支持接口测试、场景测试、定时任务等功能。采用 NestJS + Vue 3 技术栈，提供完整的 API 测试解决方案。

## ✨ 功能特性

- **项目管理** - 创建、管理测试项目，支持导入导出
- **API 管理** - 接口文档管理，支持 Swagger/OpenAPI 导入
- **测试用例** - 单接口测试，支持断言、变量提取
- **场景测试** - 多步骤业务流程测试，支持变量传递
- **环境管理** - 多环境配置，支持变量替换
- **测试报告** - 详细测试结果分析，支持 AI 总结
- **定时任务** - 基于 Cron 表达式的自动化测试调度
- **AI 集成** - AI 辅助测试生成、断言生成、错误分析
- **用户认证** - 登录、修改密码、权限管理

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装与运行

```bash
# 1. 克隆项目
git clone https://github.com/Gloria0929/APIForge.git
cd APIForge

# 2. 安装依赖
npm install
cd frontend && npm install && cd ..

# 3. 启动后端（端口 3000）
npm run dev

# 4. 新终端启动前端（端口 5173）
cd frontend && npm run dev
```

访问 http://localhost:5173 即可使用。

**首次启动**：系统会自动创建 `admin` 账号，初始密码会在后端控制台以红色输出，请妥善保存。

### 单体模式（生产部署）

```bash
# 构建前端
cd frontend && npm run build && cd ..

# 构建后端
npm run build

# 启动（后端会托管前端静态资源）
npm start
```

访问 http://localhost:3000

## 🐳 Docker 部署

官方镜像：

```text
crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

### 1. 拉取镜像

```bash
docker pull crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
```

如果提示未登录或无权限，先登录阿里云 ACR：

```bash
docker login --username=<阿里云账号> \
  crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com
```

### 2. 运行容器

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

访问 http://localhost:3000。数据持久化在 `apiforge-data` 卷中。

参数说明：

- `--name apiforge`：页面内一键更新依赖这个容器名，不要改名。
- `-v apiforge-data:/app/data`：保存 SQLite 数据库，重建容器时必须沿用。
- `-v /var/run/docker.sock:/var/run/docker.sock`：允许页面内一键更新调用宿主机 Docker。
  不需要页面更新时可删除该行，改为手动拉取镜像并重建容器。
- `--add-host host.docker.internal:host-gateway`：让容器访问宿主机上的服务。

如果镜像是私有仓库，且需要页面内自动更新，还要把 ACR 凭据传给容器：

```bash
-e DOCKER_REGISTRY_USERNAME=<阿里云账号> \
-e DOCKER_REGISTRY_PASSWORD=<仓库密码>
```

### 3. 升级

`docker pull` 只下载新镜像，不会替换正在运行的容器。升级时执行：

```bash
docker pull crpi-oyufwyf58ihnohbf.cn-hangzhou.personal.cr.aliyuncs.com/freyax/apiforge:latest
docker stop apiforge
docker rm apiforge

# 再执行一次上面的 docker run 命令，apiforge-data 数据卷保持不变
```

也可以保留 Docker socket 挂载，在页面「系统更新」中一键更新。

### Docker Compose

在仓库目录中执行：

```bash
docker compose up -d
```

`docker-compose.yml` 已包含 `host.docker.internal` 映射、数据卷和 Docker socket 挂载。
从源码构建使用该方式；直接运行官方镜像使用上面的 `docker run` 命令。

> 数据卷在 compose 里显式写了 `name: apiforge-data`，因此**实际卷名固定为 `apiforge-data`**，
> 与 `docker run -v apiforge-data:/app/data` 完全一致。不要删掉这一行：不写 `name` 时
> compose 会按项目名加前缀，生成 `apiforge_apiforge-data`，换个目录名就会挂到新的空卷上，
> 表现为「数据丢失」。

**测试宿主机上的服务**：容器内的 `127.0.0.1` 指向容器自身。环境的基础 URL 写
`http://127.0.0.1:8080` 或 `http://localhost:8080` 时，APIForge 会自动改写为
`host.docker.internal`，无需手写；依赖上面的 `--add-host`（compose 已配置）。
如需保留原地址，设置 `APIFORGE_KEEP_LOOPBACK=true`。

### 更新方式：固定跟踪 latest（默认）

默认不再比较语义化版本号，而是比较**镜像摘要**：

1. 读取远端 `:latest` 的 manifest 摘要。
2. 读取当前运行镜像的 `RepoDigest`。
3. 两者不同就提示更新，更新时固定拉取 `:latest`。

因此发布新镜像只需重新构建并覆盖 `latest`，**不需要修改 `package.json` 版本号，也不需要创建新的版本 tag**。

如需恢复旧的语义化版本比较方式，设置：

```bash
UPDATE_TRACK=version
```

### 自动更新（国内网络 / 私有仓库）

默认从 Docker Hub 拉取，国内经常超时，或被杀软/镜像加速的白名单拦截。可以把镜像放到
国内仓库（阿里云 ACR 个人版免费、腾讯 TCR、华为 SWR），并让更新检测也绕开 Docker Hub：

```bash
# 1) 只推国内仓库（不需要 Docker Hub 账号）
docker login --username=<阿里云账号> crpi-xxxx.<region>.personal.cr.aliyuncs.com
REGISTRY=crpi-xxxx.<region>.personal.cr.aliyuncs.com/<命名空间> ./scripts/docker-push.sh

# 想同时推 Docker Hub 时再传用户名（需先 docker login 到 Hub，且该账号有写权限）
REGISTRY=crpi-xxxx.<region>.personal.cr.aliyuncs.com/<命名空间> \
  ./scripts/docker-push.sh <dockerhub用户>

# 2) 配置更新源（可选；官方镜像已内置「ACR 主源 + Docker Hub 备选」）
DOCKER_IMAGE=crpi-xxxx.<region>.personal.cr.aliyuncs.com/<命名空间>/apiforge:latest
DOCKER_IMAGE_MIRRORS=foehao09/apiforge,docker.m.daocloud.io
UPDATE_TRACK=latest
# 私有仓库需要认证时（ACR 用 Bearer token，已内置支持）
DOCKER_REGISTRY_USERNAME=<阿里云账号>
DOCKER_REGISTRY_PASSWORD=<仓库密码>
```

> `UPDATE_TRACK=version` 时才使用 `VERSION_MANIFEST_URL` 和语义化版本 tags；
> `latest` 模式只需要能读取仓库的 manifest 摘要。

> ACR 个人版的镜像地址形如 `crpi-xxxxxxxx.<region>.personal.cr.aliyuncs.com/<命名空间>/<仓库>`；
> 推送时若报 `repository does not exist`，先在控制台创建 `apiforge` 仓库或开启「仓库自动创建」。
> 个人版的 manifest 接口需要认证；`latest` 模式需配置 `DOCKER_REGISTRY_USERNAME/PASSWORD`
> 才能读取摘要，`UPDATE_TRACK=version` 模式也可改用 `VERSION_MANIFEST_URL` 绕开仓库接口。

**常见报错**

- `denied: unknown manifest class for application/vnd.oci.empty.v1+json`：
  BuildKit 默认给多架构镜像附加 provenance 证明，索引里会多一个 OCI 空描述符，ACR 个人版不认识。
  脚本已默认关闭证明并强制 Docker 媒体类型（`--provenance=false --sbom=false
  --output type=image,push=true,oci-mediatypes=false`）；手写命令时照抄这三个参数即可。
  需要保留证明时可用 `PROVENANCE=true` 覆盖。
- `push access denied ... insufficient_scope: authorization failed`：推的镜像名**漏了 registry 主机前缀**。
  `freyax/apiforge` 会被 Docker 解析成 `docker.io/freyax/apiforge`（Docker Hub），
  而本地 Docker Hub 账号对 `freyax` 命名空间没有写权限，于是报 `insufficient_scope`。
  ACR 的正确写法必须带主机地址：`crpi-xxxx.<region>.personal.cr.aliyuncs.com/freyax/apiforge`。
  脚本现在会先做推送权限前置校验（`scripts/check-registry-push.js`），
  几秒内就能判定凭据是否有 push 权限，不必等整轮多架构构建跑完才失败。

`UPDATE_TRACK=version` 时的检测优先级：`VERSION_MANIFEST_URL` → 主源与备选源的 tags（取较高版本）→ `VERSION_LATEST`。
`UPDATE_TRACK=latest`（默认）时只比较 `:latest` 的镜像摘要。
拉取时按 `DOCKER_IMAGE` → `DOCKER_IMAGE_MIRRORS` 顺序逐个尝试，第一个成功即用；
更新后新容器会继承上述环境变量，不会丢失更新源。

### 镜像自带更新源（直接拉镜像的用户）

镜像构建时就把地址写进了 `DOCKER_IMAGE` 和 `DOCKER_IMAGE_MIRRORS`
（Dockerfile 里的 `ENV`），因此**用户从哪个仓库拉镜像，就从哪个仓库检查更新**，无需额外配置。
官方镜像默认是「阿里云 ACR 为主源、Docker Hub 为备选源」：

| 用户执行 | 检查更新 | 拉取失败时回退 |
|---|---|---|
| `docker pull crpi-xxxx.../freyax/apiforge:latest` | 阿里云 ACR | Docker Hub |
| `docker pull foehao09/apiforge:latest` | Docker Hub | 无 |

更新检测会依次尝试主源与备选源的 `:latest` 摘要，主源一时不可用时仍能发现更新；
拉取时按主源 → 备选源逐个尝试。

注意事项：

1. 用仓库里的 `docker-compose.yml` 部署时，若环境变量显式写了 `DOCKER_IMAGE`，会**覆盖**镜像内的值；
   该行默认已注释，保持跟随镜像即可。
2. 已经在跑旧镜像的实例不会自动换仓库，需要手动拉新地址并重建一次容器（之后就能自更新）。
3. 公开仓库无需登录即可拉取与检测更新（匿名 Bearer token 已支持）；私有仓库需要
   `DOCKER_REGISTRY_USERNAME/PASSWORD`。
4. 页面提示「无法连接 Docker」通常是因为容器启动时没有挂载
   `-v /var/run/docker.sock:/var/run/docker.sock`。按上面的 `docker run` 命令重建容器即可；
   不需要页面一键更新时，直接 `docker pull` 后手动重建容器。

## 🛠 技术栈

| 层级 | 技术                                    |
| ---- | --------------------------------------- |
| 后端 | NestJS、TypeORM、SQLite/PostgreSQL      |
| 前端 | Vue 3、Element Plus、Tailwind CSS、Vite |
| AI   | 支持 OpenAI 及兼容 API                  |

## 📁 项目结构

```
APIForge/
├── src/                 # 后端 NestJS 源码
│   ├── modules/        # 业务模块（project、api、test、auth、ai 等）
│   └── main.ts
├── frontend/            # 前端 Vue 3 源码
│   └── src/
│       ├── views/      # 页面组件
│       ├── store/     # Pinia 状态
│       └── router/     # 路由配置
├── docs/               # 详细文档
└── docker-compose.yml
```

## 📖 文档

- [功能与使用指南](docs/README.md) - 完整功能说明、API 文档、开发指南
- [Docker 构建与推送](docs/DOCKER.md) - 多架构镜像构建说明

## 📄 许可证

ISC
