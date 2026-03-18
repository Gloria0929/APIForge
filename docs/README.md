# APIForge - AI 自动化 API 测试平台

APIForge 是一个现代化的 API 测试平台，集成了 AI 能力，支持接口测试、场景测试、定时任务等功能。平台采用 NestJS + Vue 3 技术栈，提供完整的 API 测试解决方案。

## 🎯 平台特色

### 技术架构优势

- **全栈 TypeScript** - 前后端统一语言，类型安全
- **模块化设计** - 清晰的业务模块分离，易于扩展
- **现代化 UI** - Vue 3 + Element Plus + Tailwind CSS
- **AI 原生集成** - 深度集成 AI 能力，智能测试辅助
- **场景测试引擎** - 支持复杂业务流程的自动化测试

### 核心价值

- **提高测试效率** - 自动化测试生成和执行
- **降低技术门槛** - 可视化界面，无需编码经验
- **保障测试质量** - 全面的断言和变量管理
- **支持团队协作** - 项目级别的权限和共享

## 🚀 功能特性

### 核心功能

- **项目管理** - 创建、管理测试项目，支持项目导入导出
- **API 管理** - 接口文档管理，支持 Swagger/OpenAPI 导入
- **测试用例** - 单接口测试，支持断言、变量提取
- **场景测试** - 多步骤业务流程测试，支持变量传递
- **环境管理** - 多环境配置，支持变量替换
- **测试报告** - 详细的测试结果分析，支持 AI 总结
- **定时任务** - 基于 Cron 表达式的自动化测试调度
- **AI 集成** - AI 辅助测试生成、错误分析、报告总结

### 技术特色

- **现代化架构** - 前后端分离，TypeScript 全栈开发
- **AI 增强** - 集成多种 AI 模型，智能测试辅助
- **场景测试** - 支持复杂业务流程的自动化测试
- **变量传递** - 测试步骤间数据共享和传递
- **响应式设计** - 支持桌面和移动端访问
- **暗色模式** - 提供舒适的视觉体验

## 📦 项目结构

### 后端架构 (NestJS)

```
src/
├── modules/               # 业务模块
│   ├── project/          # 项目管理模块
│   │   ├── project.entity.ts      # 项目实体
│   │   ├── project.service.ts     # 项目业务逻辑
│   │   ├── project.controller.ts  # 项目API控制器
│   │   └── project.module.ts      # 项目模块配置
│   ├── api/              # API管理模块
│   │   ├── api.entity.ts          # API实体
│   │   ├── api.service.ts         # API业务逻辑
│   │   ├── api.controller.ts      # API控制器
│   │   └── api.module.ts          # API模块配置
│   ├── test/             # 测试管理模块
│   │   ├── test-case.entity.ts    # 测试用例实体
│   │   ├── test-scenario.entity.ts # 测试场景实体
│   │   ├── test-report.entity.ts  # 测试报告实体
│   │   ├── test.service.ts        # 测试业务逻辑
│   │   ├── test.controller.ts     # 测试控制器
│   │   └── test.module.ts         # 测试模块配置
│   ├── environment/      # 环境管理模块
│   │   ├── environment.entity.ts  # 环境实体
│   │   ├── environment.service.ts # 环境业务逻辑
│   │   ├── environment.controller.ts # 环境控制器
│   │   └── environment.module.ts  # 环境模块配置
│   ├── ai/               # AI功能模块
│   │   ├── ai-provider.entity.ts  # AI提供商实体
│   │   ├── project-ai-config.entity.ts # 项目AI配置实体
│   │   ├── ai-usage-log.entity.ts # AI使用日志实体
│   │   ├── ai.service.ts          # AI业务逻辑
│   │   ├── ai.controller.ts       # AI控制器
│   │   └── ai.module.ts           # AI模块配置
│   └── schedule/         # 定时任务模块
│       ├── schedule.entity.ts     # 定时任务实体
│       ├── schedule.service.ts    # 定时任务业务逻辑
│       ├── schedule.controller.ts # 定时任务控制器
│       └── schedule.module.ts     # 定时任务模块配置
├── app.module.ts         # 应用根模块
└── main.ts              # 应用入口文件
```

### 前端架构 (Vue 3)

```
frontend/
├── src/
│   ├── views/            # 页面组件
│   │   ├── project/      # 项目管理页面
│   │   │   ├── ProjectList.vue      # 项目列表
│   │   │   └── ProjectDetail.vue    # 项目详情
│   │   ├── api/          # API管理页面
│   │   │   ├── ApiList.vue          # API列表
│   │   │   └── ApiDetail.vue        # API详情
│   │   ├── test/         # 测试管理页面
│   │   │   ├── TestList.vue         # 测试用例列表
│   │   │   ├── TestDetail.vue       # 测试用例详情
│   │   │   ├── TestScenarioList.vue # 场景测试列表
│   │   │   ├── TestScenarioDetail.vue # 场景测试详情
│   │   │   ├── TestReportList.vue   # 测试报告列表
│   │   │   └── TestReportDetail.vue # 测试报告详情
│   │   ├── environment/  # 环境管理页面
│   │   │   └── EnvironmentList.vue  # 环境列表
│   │   └── ai/           # AI配置页面
│   │       └── AiConfig.vue         # AI配置
│   ├── router/           # 路由配置
│   │   └── index.ts      # 路由定义
│   ├── store/            # 状态管理
│   │   ├── project.ts    # 项目状态
│   │   └── ai.ts         # AI状态
│   ├── components/       # 公共组件
│   │   └── HelloWorld.vue # 示例组件
│   ├── App.vue           # 根组件
│   ├── main.ts           # 应用入口
│   └── style.css         # 全局样式
├── package.json          # 前端依赖配置
└── vite.config.ts        # Vite构建配置
```

## 🛠️ 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn
- SQLite 数据库

### 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd frontend
npm install
```

### 启动项目

```bash
# 启动后端服务 (端口 3000)
npm run dev

# 启动前端服务 (端口 5174)
cd frontend
npm run dev
```

### 访问应用

- 前端界面: http://localhost:5174
- 后端 API: http://localhost:3000

## 📖 详细使用指南

### 1. 项目管理

#### 创建项目

1. 访问项目列表页面
2. 点击"新建项目"按钮
3. 填写项目名称和描述
4. 保存项目

#### 项目导入导出

- **导出项目**: 在项目详情页点击"导出"按钮，下载项目数据文件
- **导入项目**: 在项目列表页点击"导入"按钮，上传项目数据文件

#### 项目设置

- 支持项目级别的环境配置
- 可以设置默认的测试环境
- 支持项目级别的 AI 配置

### 2. API 管理

#### 添加 API

1. 进入项目详情页
2. 点击"API 管理"标签
3. 点击"新建 API"按钮
4. 填写接口信息：
   - 接口名称
   - 请求方法 (GET/POST/PUT/DELETE)
   - 请求路径
   - 请求头
   - 请求体
   - 预期响应

#### 导入 Swagger/OpenAPI

1. 在 API 列表页点击"导入"按钮
2. 上传 Swagger JSON 文件或输入 URL
3. 系统自动解析并导入所有接口

#### API 调试

1. 在 API 详情页点击"调试"标签
2. 选择测试环境
3. 修改请求参数（可选）
4. 点击"发送请求"按钮
5. 查看响应结果和测试报告

### 3. 测试用例管理

#### 创建测试用例

1. 进入"测试用例"页面
2. 点击"新建测试"按钮
3. 配置测试信息：
   - **测试名称** - 标识测试用例的唯一名称
   - **关联的 API** - 选择要测试的接口
   - **测试环境** - 选择执行环境
   - **请求参数覆盖** - 可覆盖默认请求参数
   - **断言规则** - 配置验证规则

#### 测试断言配置

支持多种断言类型，每种断言支持多个条件：

**状态码断言**

```typescript
{
  type: 'status_code',
  expected: 200,
  operator: 'equals' // equals, not_equals, greater_than, less_than
}
```

**响应体断言**

```typescript
{
  type: 'response_body',
  path: '$.data.user.id', // JSON Path 表达式
  expected: '123',
  operator: 'equals'
}
```

**响应头断言**

```typescript
{
  type: 'response_header',
  header: 'Content-Type',
  expected: 'application/json',
  operator: 'contains'
}
```

**响应时间断言**

```typescript
{
  type: 'response_time',
  expected: 1000, // 毫秒
  operator: 'less_than'
}
```

#### 变量提取配置

支持从响应中提取变量，用于后续测试步骤：

**JSON Path 提取**

```typescript
{
  type: 'json_path',
  name: 'user_id',
  path: '$.data.user.id',
  defaultValue: null
}
```

**正则表达式提取**

```typescript
{
  type: 'regex',
  name: 'token',
  pattern: 'token=(\\w+)',
  group: 1,
  defaultValue: null
}
```

**响应头提取**

```typescript
{
  type: 'header',
  name: 'session_id',
  header: 'Set-Cookie',
  pattern: 'session=(\\w+)',
  group: 1
}
```

### 4. 场景测试

#### 创建测试场景

1. 进入"场景测试"页面
2. 点击"新建场景"按钮
3. 设置场景信息：
   - **场景名称** - 标识场景的唯一名称
   - **场景描述** - 描述场景的业务逻辑
   - **测试环境** - 选择执行环境
   - **全局变量** - 定义场景级别的共享变量

#### 添加测试步骤

场景支持多种类型的测试步骤：

**测试用例步骤**

```typescript
{
  type: 'test_case',
  testCaseId: 'uuid',
  name: '用户登录',
  variableMapping: {
    // 变量映射：场景变量 -> 测试用例变量
    'username': 'login.username',
    'password': 'login.password'
  }
}
```

**API 请求步骤**

```typescript
{
  type: 'api_request',
  method: 'POST',
  url: '/api/login',
  headers: {
    'Content-Type': 'application/json'
  },
  body: {
    username: '${username}', // 使用场景变量
    password: '${password}'
  },
  assertions: [
    {
      type: 'status_code',
      expected: 200
    }
  ]
}
```

**变量提取步骤**

```typescript
{
  type: 'variable_extraction',
  name: '提取登录令牌',
  source: 'response', // 从前一步骤的响应中提取
  extractions: [
    {
      type: 'json_path',
      name: 'access_token',
      path: '$.data.access_token'
    }
  ]
}
```

#### 场景变量传递机制

**变量传递流程**

```
步骤1 (登录) → 提取 token → 步骤2 (获取用户信息) → 步骤3 (更新用户信息)
    ↓              ↓                    ↓
全局变量       场景变量             场景变量
```

**变量作用域规则**

- **全局变量** - 整个场景可见，可被所有步骤使用
- **步骤变量** - 仅当前步骤可见，通过提取器生成
- **环境变量** - 从环境配置继承，优先级最低

#### 执行场景测试

1. **选择执行环境** - 确定测试的基础URL和变量
2. **配置执行参数** - 设置并发数、超时时间等
3. **监控执行进度** - 实时查看每个步骤的执行状态
4. **分析测试报告** - 查看详细的执行结果和错误信息

**场景执行报告包含**

- 每个步骤的执行状态（成功/失败）
- 步骤间的变量传递情况
- 请求和响应的详细日志
- 性能指标和耗时统计
- AI 生成的执行总结

### 5. 环境管理

#### 创建环境

1. 进入"环境管理"页面
2. 点击"新建环境"按钮
3. 配置环境信息：
   - 环境名称
   - 基础 URL
   - 环境变量
   - 请求头配置

#### 环境变量

支持多种变量类型：

- **字符串变量** - 普通文本值
- **密钥变量** - 加密存储的敏感信息
- **动态变量** - 支持表达式计算的变量

#### 环境切换

- 在测试执行时选择目标环境
- 支持环境变量的自动替换
- 提供环境激活状态管理

### 6. 测试报告

#### 查看测试报告

1. 进入"测试报告"页面
2. 查看测试执行历史
3. 点击报告查看详细信息

#### 报告内容

- **执行概览** - 测试通过率、执行时间等统计信息
- **请求详情** - 每个请求的详细日志
- **断言结果** - 每个断言的成功/失败状态
- **性能数据** - 响应时间、吞吐量等性能指标
- **AI 分析** - AI 生成的测试总结和建议

#### 报告导出

- 支持导出为 JSON 格式
- 支持导出为 HTML 报告
- 可以对比不同版本的测试报告

### 7. 定时任务

#### 创建定时任务

1. 进入项目设置页面
2. 点击"定时任务"标签
3. 点击"新建任务"按钮
4. 配置任务信息：
   - 任务名称
   - Cron 表达式
   - 测试场景或测试用例
   - 执行环境
   - 通知配置

#### Cron 表达式

支持标准的 Cron 表达式格式：

```
*    *    *    *    *
│    │    │    │    │
│    │    │    │    └── 星期 (0 - 6) (0 表示周日)
│    │    │    └───── 月份 (1 - 12)
│    │    └──────── 日期 (1 - 31)
│    └───────── 小时 (0 - 23)
└────────── 分钟 (0 - 59)
```

#### 任务监控

- 查看任务执行历史
- 监控任务执行状态
- 接收任务执行通知

### 8. AI 功能

#### AI 模型配置

1. 进入"AI 配置"页面
2. 添加 AI 服务提供商：
   - OpenAI GPT
   - 其他兼容的 AI 服务
3. 配置 API 密钥和端点
4. 测试连接状态

#### AI 辅助测试

- **测试生成** - 根据 API 文档自动生成测试用例
- **断言生成** - 智能生成测试断言规则
- **错误分析** - 分析测试失败的根本原因
- **报告总结** - 自动生成测试报告摘要

#### AI 使用限制

- 支持使用量统计
- 可配置使用频率限制
- 提供使用日志记录

## 🔧 开发指南

### 后端开发 (NestJS)

#### 模块架构设计

每个业务模块遵循标准的 NestJS 模块结构：

```typescript
// 示例：项目模块
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Project,
      API,
      TestCase,
      Environment,
      TestScenario,
    ]),
  ],
  controllers: [ProjectController],
  providers: [ProjectService],
  exports: [ProjectService],
})
export class ProjectModule {}
```

#### 实体设计模式

所有实体使用 TypeORM 装饰器：

```typescript
@Entity()
export class Project {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  name: string;

  @OneToMany(() => API, (api) => api.project)
  apis: API[];
}
```

#### 服务层设计

服务层负责业务逻辑，使用依赖注入：

```typescript
@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private projectRepository: Repository<Project>,
    @InjectRepository(API)
    private apiRepository: Repository<API>,
  ) {}

  async exportProject(id: string) {
    // 复杂的业务逻辑实现
  }
}
```

#### 控制器层设计

控制器负责处理 HTTP 请求：

```typescript
@Controller("projects")
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

  @Get()
  findAll() {
    return this.projectService.findAll();
  }
}
```

#### 添加新模块步骤

1. **创建模块目录** - 在 `src/modules/` 下创建新目录
2. **实现实体类** - 定义数据库表结构
3. **实现服务类** - 编写业务逻辑
4. **实现控制器** - 定义 API 接口
5. **配置模块** - 创建模块配置文件
6. **注册模块** - 在 `app.module.ts` 中导入

### 前端开发 (Vue 3)

#### 技术栈配置

- **框架** - Vue 3 + Composition API
- **UI 库** - Element Plus
- **样式** - Tailwind CSS + 自定义 CSS 变量
- **路由** - Vue Router 4
- **状态管理** - Pinia
- **构建工具** - Vite

#### 页面组件结构

```vue
<template>
  <PageContainerLayout title="页面标题" description="页面描述">
    <!-- 页面内容 -->
  </PageContainerLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";

// 响应式数据
const loading = ref(false);
const data = ref([]);

// 生命周期
onMounted(() => {
  loadData();
});

// 业务方法
const loadData = async () => {
  // 数据加载逻辑
};
</script>

<style scoped>
/* 组件样式 */
</style>
```

#### 状态管理设计

使用 Pinia 进行状态管理：

```typescript
// store/project.ts
export const useProjectStore = defineStore("project", {
  state: () => ({
    projects: [],
    currentProject: null,
    loading: false,
  }),

  actions: {
    async loadProjects() {
      this.loading = true;
      try {
        const response = await api.getProjects();
        this.projects = response.data;
      } finally {
        this.loading = false;
      }
    },
  },
});
```

#### 路由配置

```typescript
// router/index.ts
const routes = [
  {
    path: "/projects",
    component: ProjectList,
    meta: { title: "项目管理" },
  },
  {
    path: "/projects/:id",
    component: ProjectDetail,
    meta: { title: "项目详情" },
  },
];
```

#### 添加新页面步骤

1. **创建页面组件** - 在 `frontend/src/views/` 下创建 `.vue` 文件
2. **配置路由** - 在 `router/index.ts` 中添加路由定义
3. **实现页面逻辑** - 编写组件脚本和模板
4. **添加样式** - 编写组件样式和响应式设计
5. **测试功能** - 验证页面功能正常

## 🐛 故障排除

### 常见问题

#### 后端启动失败

- 检查端口 3000 是否被占用
- 确认 SQLite 数据库文件可写
- 检查依赖是否安装完整

#### 前端样式不生效

- 确认 `style.css` 已正确导入
- 检查浏览器控制台是否有错误
- 确认 Element Plus 样式已加载

#### 数据库连接问题

- 检查数据库文件路径
- 确认文件读写权限
- 验证数据库表结构

#### AI 功能不可用

- 检查 AI 服务配置
- 验证 API 密钥有效性
- 确认网络连接正常

### 日志查看

#### 后端日志

```bash
# 查看后端运行日志
npm run dev
```

#### 前端日志

在浏览器开发者工具中查看控制台输出

## 📊 API 接口文档

### 项目管理接口

- `GET /projects` - 获取项目列表
- `POST /projects` - 创建项目
- `GET /projects/:id` - 获取项目详情
- `PUT /projects/:id` - 更新项目
- `DELETE /projects/:id` - 删除项目
- `GET /projects/:id/export` - 导出项目
- `POST /projects/import` - 导入项目

### API 管理接口

- `GET /apis` - 获取 API 列表
- `POST /apis` - 创建 API
- `GET /apis/:id` - 获取 API 详情
- `PUT /apis/:id` - 更新 API
- `DELETE /apis/:id` - 删除 API
- `POST /apis/import` - 导入 API

### 测试管理接口

- `GET /tests` - 获取测试用例列表
- `POST /tests` - 创建测试用例
- `GET /tests/:id` - 获取测试用例详情
- `PUT /tests/:id` - 更新测试用例
- `DELETE /tests/:id` - 删除测试用例
- `POST /tests/execute` - 执行测试
- `POST /tests/execute-suite` - 执行测试套件

### 场景测试接口

- `GET /tests/scenarios` - 获取场景列表
- `POST /tests/scenarios` - 创建场景
- `GET /tests/scenarios/:id` - 获取场景详情
- `PUT /tests/scenarios/:id` - 更新场景
- `DELETE /tests/scenarios/:id` - 删除场景
- `POST /tests/scenarios/execute` - 执行场景测试

### 环境管理接口

- `GET /environments` - 获取环境列表
- `POST /environments` - 创建环境
- `GET /environments/:id` - 获取环境详情
- `PUT /environments/:id` - 更新环境
- `DELETE /environments/:id` - 删除环境
- `PUT /environments/:id/activate` - 激活环境

### AI 功能接口

- `GET /ai/providers` - 获取 AI 提供商列表
- `POST /ai/providers` - 创建 AI 提供商
- `PUT /ai/providers/:id` - 更新 AI 提供商
- `DELETE /ai/providers/:id` - 删除 AI 提供商
- `POST /ai/providers/:id/test` - 测试 AI 连接
- `POST /ai/generate-tests` - AI 生成测试
- `POST /ai/generate-assertions` - AI 生成断言
- `POST /ai/analyze-error` - AI 分析错误
- `POST /ai/summarize-report` - AI 总结报告

## 🤝 贡献指南

我们欢迎社区贡献！请遵循以下步骤：

1. Fork 本项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

本项目采用 ISC 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 🙏 致谢

感谢以下开源项目的支持：

- [NestJS](https://nestjs.com/) - 强大的 Node.js 框架
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Element Plus](https://element-plus.org/) - Vue 3 组件库
- [TypeORM](https://typeorm.io/) - Node.js ORM
- [Vite](https://vitejs.dev/) - 前端构建工具

---

**APIForge** - 让 API 测试更智能、更高效！
