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

```bash
# 使用 docker-compose
docker-compose up -d

# 或直接运行镜像
docker run -d -p 3000:3000 -v apiforge-data:/app/data apiforge:latest
```

数据持久化在 `apiforge-data` 卷中。

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
