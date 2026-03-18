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

# 启动前端服务 (端口 5173)
cd frontend
npm run dev
```

### 访问应用

- 前端界面: [http://localhost:5173](http://localhost:5173)
- 后端 API: [http://localhost:3000](http://localhost:3000)

## 📖 详细使用指南

### 1. 项目管理

![项目管理](image/截屏2026-03-18%2020.00.00.png)

统一管理工作区、项目说明与最近接入的接口测试空间。

#### 功能按钮

| 按钮         | 说明                                 |
| ------------ | ------------------------------------ |
| **导入项目** | 上传项目数据文件，批量恢复项目       |
| **创建项目** | 新建测试项目，填写名称与描述         |
| **进入**     | 进入项目详情，管理接口、用例、场景等 |
| **导出**     | 下载项目数据文件，用于备份或迁移     |
| **编辑**     | 修改项目名称和描述                   |
| **删除**     | 删除项目及其关联数据                 |

#### 统计卡片

- **项目总数**：当前已纳管项目数量
- **当前页**：分页浏览，支持 10 条/页

---

### 2. 接口文档

![导入 API](image/截屏2026-03-18%2020.00.14.png)
![接口目录](image/截屏2026-03-18%2020.03.54.png)
导入、标注、分析并维护接口清单。批量 AI 分析会自动补全业务标签、风险线索与语义信息。支持搜索、分页浏览、导入 Swagger/OpenAPI/Postman 与批量 AI 分析。

#### 功能按钮

| 按钮                 | 说明                                        |
| -------------------- | ------------------------------------------- |
| **导入 API**         | 打开导入弹窗，支持 Swagger/OpenAPI、Postman |
| **AI 批量分析**      | 对选中接口执行 AI 语义分析，补全标签与风险  |
| **批量生成测试用例** | 根据选中接口自动生成测试用例                |
| **创建 API**         | 手动新建接口，填写路径、方法、摘要等        |

#### 导入 API 弹窗

- **导入方式**：Swagger/OpenAPI（2.0、3.x）或 Postman Collection（v2.1）
- **数据来源**：上传文件、粘贴内容、URL 地址
- **支持格式**：JSON、JSON5、YAML

#### 接口目录表格

- **搜索**：按 ID、路径、业务摘要筛选
- **请求方式**：按 GET/POST/PUT/DELETE 等筛选
- **操作**：详情、编辑、删除

#### 统计卡片

- **接口总数**：当前项目内全部接口
- **筛选结果**：根据搜索条件命中的接口数
- **已标签接口**：已补全标签的接口数
- **AI 状态**：语义分析进度（如 GET 占比最高）

---

### 3. API 详情

![API 详情](image/截屏2026-03-18%2020.04.08.png)
![AI 语义分析](image/截屏2026-03-18%2020.04.20.png)

查看接口定义、运行 AI 语义分析、生成测试建议并直接调试请求。

#### 功能按钮

| 按钮                | 说明                           |
| ------------------- | ------------------------------ |
| **AI 分析接口**     | 对当前接口执行 AI 语义分析     |
| **AI 生成测试建议** | 根据接口定义生成断言与测试建议 |
| **调试接口**        | 选择环境发送请求，查看响应     |

#### 页面内容

- **基本信息**：路径、方法、摘要、描述、标签
- **请求参数**：参数名、位置、必填、类型、描述
- **响应定义**：JSON Schema 预览
- **AI 接口语义分析**（分析后显示）：
  - 业务上下文、敏感字段、接口分类
  - 推荐测试方向（正常路径、缺失必填、边界值、未授权、安全测试等）
  - 字段语义说明

---

### 4. 测试用例

![测试用例详情](image/截屏2026-03-18%2020.05.12.png)

查看请求、断言与执行结果，支持 AI 生成断言、分析失败原因。

#### 功能按钮

| 按钮            | 说明                         |
| --------------- | ---------------------------- |
| **执行测试**    | 选择环境执行当前用例         |
| **AI 生成断言** | 根据实际响应自动生成断言规则 |
| **AI 分析失败** | 分析测试失败原因并给出建议   |

#### 配置内容

- **请求配置**：method、url、headers、query、body
- **断言配置**：添加断言、应用选中

---

### 5. 测试报告

![测试报告](image/截屏2026-03-18%2020.05.22.png)

按环境和执行结果查看历史报告，支持分页、导出与双报告差异对比。

#### 功能按钮

| 按钮         | 说明                     |
| ------------ | ------------------------ |
| **对比所选** | 选择两份报告进行差异对比 |
| **查看**     | 打开报告详情             |
| **导出**     | 导出报告（JSON/HTML 等） |
| **更多**     | 其他操作菜单             |

#### 表格列

- 报告名称、环境、总用例、通过率、总耗时、创建时间

---

### 6. 场景测试

![场景目录](image/截屏2026-03-18%2020.05.34.png)
![场景详情](image/截屏2026-03-18%2020.05.49.png)

将登录、鉴权、上下文变量与后续接口串联成完整业务链，像搭建自动化回归流水线一样编排测试步骤。

#### 功能按钮

| 按钮               | 说明                           |
| ------------------ | ------------------------------ |
| **AI 编排场景**    | 根据描述由 AI 自动编排场景步骤 |
| **创建场景**       | 手动新建场景                   |
| **详情**           | 查看场景步骤与变量提取规则     |
| **编辑**           | 修改场景配置                   |
| **删除**           | 删除场景                       |
| **执行场景**       | 选择环境执行完整业务流程       |
| **压力测试**       | 配置并发、时长等发起负载测试   |
| **编辑**（详情页） | 修改场景基础信息与步骤         |

#### 场景压力测试弹窗

![场景压力测试](image/截屏2026-03-18%2020.05.59.png)
![场景压力测试-高级选项](image/截屏2026-03-18%2020.06.09.png)

- **基础配置**
  - **选择环境**：必选
  - **执行模式**：固定时长 / 固定请求数
  - **持续时间**：秒数（固定时长模式）
  - **虚拟用户数**：并发数
  - **报告名称**：自定义报告标题
- **高级选项**（可展开）
  - **预热时长**：0 = 立即满负载
  - **失败率阈值**：超过则提前停止，0 = 不限制
  - **步间延迟**：模拟用户操作间隔（毫秒）

#### 场景步骤

- 关联测试用例
- 变量提取规则：变量名 → JSON 路径（如 `authToken` → `$.data.token`）

---

### 7. 环境管理

![环境管理](image/截屏2026-03-18%2020.06.21.png)

集中管理 base URL、变量、密钥与激活环境，为接口调试、测试用例和场景执行提供统一上下文。支持导入导出、连接测试、变量预览与分页查看。

#### 功能按钮

| 按钮         | 说明                              |
| ------------ | --------------------------------- |
| **导入**     | 导入环境配置                      |
| **导出**     | 导出环境配置                      |
| **创建环境** | 新建环境（名称、baseUrl、变量等） |
| **批量删除** | 删除选中的环境                    |
| **激活**     | 将环境设为当前激活环境            |
| **测试**     | 测试环境连通性                    |
| **编辑**     | 修改环境配置                      |
| **删除**     | 删除单个环境                      |

#### 环境列表表格

- **环境名称**、**基础 URL**、**变量数**、**状态**（激活/未激活）
- **操作**：激活、测试、编辑、删除

#### 环境配置（创建/编辑弹窗）

- **基础信息**：环境名称、基础 URL、描述、设为激活
- **登录用例**：可选，执行测试前先执行登录用例
- **变量提取规则**：从登录响应提取 token 等（变量名 → JSON 路径）
- **自定义变量**：键值对，请求中通过 `{{key}}` 引用

---

### 8. 模型配置（AI）

![模型配置-辅助功能](image/截屏2026-03-18%2020.06.39.png)
![模型配置-提供商列表](image/截屏2026-03-18%2020.06.57.png)

配置模型提供商、启用 AI 能力、检测健康状态，为接口分析与测试生成提供统一入口。

#### 功能按钮

| 按钮           | 说明                                   |
| -------------- | -------------------------------------- |
| **辅助功能**   | 开关，启用/禁用 AI 辅助                |
| **模型提供商** | 下拉选择当前使用的提供商               |
| **新增**       | 添加 OpenAI、DeepSeek、Gemini 等提供商 |
| **保存设置**   | 保存辅助功能与提供商配置               |
| **测试连接**   | 测试当前 AI 服务可用性                 |
| **刷新状态**   | 刷新所有提供商健康状态                 |
| **测试**       | 测试单个提供商连接                     |
| **编辑**       | 修改提供商配置（API Key、模型等）      |
| **删除**       | 删除提供商                             |

#### 提供商列表

- 名称、提供商类型、模型、启用功能、状态（可用/不可用）

---

### 9. 定时任务

![定时任务](image/截屏2026-03-18%2020.07.27.png)

按 Cron 表达式定时执行测试套件或场景测试，支持启用/禁用。任务列表展示任务名称、Cron、类型（测试套件/场景）、状态、上次执行、下次执行。

#### 功能按钮

| 按钮             | 说明             |
| ---------------- | ---------------- |
| **创建定时任务** | 新建定时任务     |
| **批量删除**     | 删除选中的任务   |
| **启用/禁用**    | 切换任务执行状态 |
| **编辑**         | 修改任务配置     |
| **删除**         | 删除单个任务     |

#### 任务列表表格

- **任务名称**、**Cron**、**类型**（测试套件/场景）、**状态**（启用/禁用）
- **上次执行**、**下次执行**
- **操作**：启用/禁用、编辑、删除

#### 任务配置（创建/编辑弹窗）

- **任务名称**：如「每日回归测试」
- **Cron 表达式**：如 `0 0 * * *`（每天 0 点）、`*/5 * * * *`（每 5 分钟）
- **执行类型**：测试套件 / 场景测试
- **目标**：选择用例或场景
- **执行环境**：选择环境

**Cron 表达式格式**：`分 时 日 月 周`（如 `0 0 * * *` = 每天 0 点）

---

### 10. 用户与登录

- **右上角用户菜单**：修改密码、退出登录
- **首次启动**：控制台输出 admin 初始密码

---

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
