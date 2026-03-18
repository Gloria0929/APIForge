# APIForge: AI 自动化 API 测试平台 - 完整设计文档

## 目录

- 1. 项目概述
  - 1.1 项目简介
  - 1.2 核心目标
  - 1.3 设计哲学

- 2. 技术架构
  - 2.1 整体架构图
  - 2.2 技术栈选择
  - 2.3 功能分层架构

- 3. 核心业务功能（无AI可用）
  - 3.1 项目管理
  - 3.2 API文档管理
  - 3.3 接口调试
  - 3.4 环境管理
  - 3.5 测试用例管理（手动模式）
  - 3.6 测试执行引擎
  - 3.7 测试报告

- 4. AI模块设计（可选插件）
  - 4.1 AI功能开关机制
  - 4.2 AI服务健康检查
  - 4.3 AI配置界面
  - 4.4 AI功能降级策略
  - 4.5 AI功能模块详解

- 5. 数据库设计
  - 5.1 核心业务表
  - 5.2 AI相关表
  - 5.3 ER图概览

- 6. 前端设计
  - 6.1 技术栈
  - 6.2 目录结构
  - 6.3 页面路由设计
  - 6.4 AI状态管理

- 7. 后端设计
  - 7.1 技术栈
  - 7.2 模块划分
  - 7.3 API设计
  - 7.4 任务调度

- 8. 业务流程
  - 8.1 核心业务流（无AI）
  - 8.2 AI增强业务流
  - 8.3 降级流程

- 9. 用户引导与教育
  - 9.1 新用户首次体验
  - 9.2 AI价值提示

- 10. 项目规划
  - 10.1 MVP开发计划
  - 10.2 版本迭代路线图

- 11. 未来扩展

- 12. 总结
  - 12.1 核心价值主张
  - 12.2 设计要点回顾

---

## 1. 项目概述

### 1.1 项目简介

APIForge 是一个 Web 端的 AI 自动化 API 测试平台。支持导入 OpenAPI/Swagger 接口文档，自动解析 API，生成测试用例并执行自动化测试，最终生成可视化测试报告。平台设计秉承 **"AI 是增强，而非依赖"** 的核心原则，确保所有核心功能在无 AI 支持下依然完整可用。

### 1.2 核心目标

构建一个类似 **Postman + Apidog** 但具备 **AI 自动化能力** 的 API 测试平台。实现从 "API 文档" 到 "智能测试报告" 的全流程支持。

**核心流程：**
`Swagger/OpenAPI` → `解析` → `手动/AI生成测试` → `多环境执行` → `报告`

### 1.3 设计哲学

| 原则         | 说明                                                 |
| :----------- | :--------------------------------------------------- |
| **AI可选性** | 所有 AI 功能都是插件式的，缺失 AI 不影响核心业务流程 |
| **渐进增强** | 基础功能完整可用，AI 在之上提供智能化增值服务        |
| **降级策略** | AI 服务不可用时，系统自动降级到非 AI 模式            |
| **用户控制** | 用户可以随时开启/关闭 AI 功能，自由选择 AI 提供商    |

---

## 2. 技术架构

### 2.1 整体架构图

text

```
┌─────────────────────────────────────────────────────────────────┐
│                          前端 (Vue3)                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │项目管理  │ │API调试   │ │测试执行  │ │AI配置/增强按钮   │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ REST API
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                          后端服务 (NestJS)                        │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    控制器层                               │   │
│  │  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐          │   │
│  │  │Project │ │API     │ │Test    │ │AI      │          │   │
│  │  │Controller│Controller│ │Controller│ │Controller│          │   │
│  │  └────────┘ └────────┘ └────────┘ └────────┘          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    核心服务层                             │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐   │   │
│  │  │Parser Service│ │Test Runner │ │Environment Service│   │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘   │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────┐   │   │
│  │  │Report Gen  │ │AI Service  │ │Queue Service       │   │   │
│  │  │            │ │(可选插件)   │ │                     │   │   │
│  │  └────────────┘ └────────────┘ └────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    基础设施                               │   │
│  │    ┌──────────┐    ┌──────────┐    ┌──────────┐        │   │
│  │    │PostgreSQL│    │  Redis   │    │ BullMQ   │        │   │
│  │    └──────────┘    └──────────┘    └──────────┘        │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │   目标 API       │
                    │  (被测系统)      │
                    └──────────────────┘
```

### 2.2 技术栈选择

#### 前端

| 技术          | 用途       | 版本    |
| :------------ | :--------- | :------ |
| Vue 3         | 前端框架   | ^3.3.0  |
| TypeScript    | 类型系统   | ^5.0.0  |
| Vite          | 构建工具   | ^4.0.0  |
| Pinia         | 状态管理   | ^2.1.0  |
| Element Plus  | UI组件库   | ^2.4.0  |
| ECharts       | 数据可视化 | ^5.4.0  |
| Axios         | HTTP客户端 | ^1.4.0  |
| Monaco Editor | JSON编辑器 | ^0.39.0 |

#### 后端

| 技术       | 用途      | 版本    |
| :--------- | :-------- | :------ |
| NestJS     | 后端框架  | ^10.0.0 |
| TypeScript | 开发语言  | ^5.0.0  |
| TypeORM    | ORM框架   | ^0.3.17 |
| PostgreSQL | 主数据库  | 15.x    |
| Redis      | 缓存/队列 | 7.x     |
| BullMQ     | 任务队列  | ^4.0.0  |
| Joi        | 数据验证  | ^17.9.0 |
| Winston    | 日志      | ^3.9.0  |

### 2.3 功能分层架构

text

```
┌─────────────────────────────────────────────────────┐
│                 AI 增值层 (可选插件)                  │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │AI测试生成   │ │AI断言生成   │ │AI失败分析   │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐                   │
│  │AI报告总结   │ │AI语义解析   │                   │
│  └─────────────┘ └─────────────┘                   │
├─────────────────────────────────────────────────────┤
│                核心业务层 (必需)                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │API导入/解析 │ │基础测试管理  │ │环境管理     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │测试执行引擎 │ │报告生成     │ │接口调试     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
├─────────────────────────────────────────────────────┤
│                基础数据层                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │项目管理     │ │用户/权限    │ │数据存储     │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
└─────────────────────────────────────────────────────┘
```

---

## 3. 核心业务功能（无AI可用）

### 3.1 项目管理

#### 功能描述

用户可以在平台上创建多个项目，每个项目包含一组相关的 API、测试用例和环境配置。

#### 数据模型

typescript

```
interface Project {
  id: string;              // 项目ID
  name: string;            // 项目名称
  description?: string;    // 项目描述
  createdAt: Date;         // 创建时间
  updatedAt: Date;         // 更新时间
  createdBy: string;       // 创建人
  members?: ProjectMember[]; // 项目成员
}

interface ProjectMember {
  userId: string;
  role: 'admin' | 'editor' | 'viewer';
}
```

#### 功能列表

- ✅ 创建/编辑/删除项目
- ✅ 项目列表展示与搜索
- ✅ 项目成员管理
- ✅ 项目设置（基础信息）
- ✅ 项目导出/导入

### 3.2 API文档管理

#### 导入功能

| 支持格式           | 导入方式     | 说明                                 |
| :----------------- | :----------- | :----------------------------------- |
| Swagger 2.0/3.0    | JSON文件/URL | 完整解析paths、parameters、responses |
| OpenAPI 3.x        | JSON/YAML    | 支持所有OpenAPI特性                  |
| Postman Collection | JSON文件     | 解析请求示例、测试脚本               |
| HAR文件            | JSON文件     | 从浏览器/工具导入                    |

#### 解析结果示例

text

```
项目：电商API
├── 用户模块
│   ├── GET /api/users - 获取用户列表
│   ├── POST /api/users - 创建用户
│   └── GET /api/users/{id} - 获取用户详情
├── 商品模块
│   ├── GET /api/products - 商品列表
│   └── GET /api/products/{id} - 商品详情
└── 订单模块
    ├── POST /api/orders - 创建订单
    └── GET /api/orders/{id} - 查询订单
```

#### API数据模型

typescript

```
interface API {
  id: string;
  projectId: string;
  path: string;           // API路径，如 /users/{id}
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  summary: string;        // 接口摘要
  description?: string;   // 详细描述
  tags: string[];        // 分类标签

  // 请求定义
  parameters: Parameter[];
  requestBody?: RequestBody;

  // 响应定义
  responses: Record<string, Response>;

  // 元数据
  createdAt: Date;
  updatedAt: Date;
}

interface Parameter {
  name: string;
  in: 'query' | 'path' | 'header' | 'cookie';
  required: boolean;
  type: string;          // string, number, boolean, array, object
  format?: string;       // email, date, uuid, etc.
  description?: string;
  example?: any;
  schema?: any;          // JSON Schema
}
```

### 3.3 接口调试

#### 调试界面布局

text

```
┌─────────────────────────────────────────────────────────────┐
│ [GET] [https://api.example.com/users/{{userId}}] [发送]    │
├─────────────────────────────────────────────────────────────┤
│ 请求参数                          │ 响应结果                 │
│ ┌──────────────────┐             │ ┌──────────────────┐    │
│ │ 认证: Bearer {{token}}│         │ │ 状态: 200 OK     │    │
│ │ 查询参数:                     │ │ 时间: 234ms      │    │
│ │   page = 1                    │ │ 大小: 1.2KB      │    │
│ │   limit = 20                  │ ├──────────────────┤    │
│ │ 请求体:                        │ │ {                │    │
│ │ {                             │ │   "code": 0,     │    │
│ │   "name": "test"              │ │   "data": [       │    │
│ │ }                             │ │     {...}         │    │
│ └──────────────────┘             │ │   ]              │    │
│                                  │ │ }                │    │
│ [保存为测试用例] [AI生成断言]     │ └──────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### 调试功能

| 功能     | 说明                                       |
| :------- | :----------------------------------------- |
| 请求方法 | 支持所有HTTP方法                           |
| URL构建  | 支持环境变量占位符 {{var}}                 |
| 认证     | Basic Auth、Bearer Token、API Key、OAuth2  |
| Headers  | 自定义请求头                               |
| 查询参数 | Key-Value形式编辑                          |
| 请求体   | JSON、XML、FormData、x-www-form-urlencoded |
| 响应预览 | 格式化、高亮、折叠                         |
| 历史记录 | 保存最近调试记录                           |

### 3.4 环境管理

#### 环境配置

typescript

```
interface Environment {
  id: string;
  projectId: string;
  name: string;           // 如 DEV、TEST、STAGING、PROD
  baseUrl: string;        // https://dev-api.example.com
  description?: string;
  variables: EnvironmentVariable[];
  isActive?: boolean;     // 当前是否选中
  createdAt: Date;
}

interface EnvironmentVariable {
  key: string;            // 如 token、userId
  value: string;          // 实际值
  type: 'string' | 'number' | 'boolean' | 'secret';
  description?: string;
}
```

#### 变量替换机制

text

```
原始请求: GET {{baseUrl}}/users/{{userId}}
请求头: Authorization: Bearer {{token}}

环境配置:
- baseUrl: https://dev-api.example.com
- userId: 10086
- token: eyJhbGciOiJIUzI1NiIs...

替换后:
- URL: https://dev-api.example.com/users/10086
- 请求头: Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

#### 环境管理功能

- ✅ 创建/编辑/删除环境
- ✅ 环境变量增删改查
- ✅ 变量值加密存储（secret类型）
- ✅ 环境快速切换
- ✅ 环境配置导出/导入
- ✅ 环境变量继承（全局变量 + 环境变量）

### 3.5 测试用例管理（手动模式）

#### 测试用例模型

typescript

```
interface TestCase {
  id: string;
  projectId: string;
  apiId?: string;         // 关联的API（可选）
  name: string;           // 用例名称
  description?: string;

  // 请求定义
  request: {
    method: string;
    url: string;          // 支持变量
    headers: Record<string, string>;
    query: Record<string, any>;
    body?: any;
    auth?: AuthConfig;
  };

  // 断言定义
  assertions: Assertion[];

  // 前置操作
  setup?: TestHook[];

  // 后置操作
  teardown?: TestHook[];

  // 元数据
  tags: string[];
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  createdAt: Date;
  updatedAt: Date;
}

interface Assertion {
  type: 'STATUS' | 'HEADER' | 'BODY' | 'JSON_PATH' | 'RESPONSE_TIME' | 'CUSTOM_SCRIPT';
  target?: string;        // 如 $.data.token
  condition: 'eq' | 'neq' | 'gt' | 'lt' | 'contains' | 'exists' | 'matches';
  expected: any;
  message?: string;       // 失败时的提示
}

interface TestHook {
  type: 'DELAY' | 'SCRIPT' | 'REQUEST';
  config: any;            // 延迟时间/脚本内容/前置请求
}
```

#### 手动创建方式

| 方式       | 说明                           |
| :--------- | :----------------------------- |
| 从调试保存 | 在调试界面点击"保存为测试用例" |
| 手动新建   | 表单填写所有字段               |
| 批量导入   | 从CSV/JSON文件导入             |
| 复制用例   | 基于现有用例修改               |

#### 测试用例示例

json

```
{
  "name": "用户登录-正常场景",
  "apiId": "api_login",
  "request": {
    "method": "POST",
    "url": "{{baseUrl}}/auth/login",
    "headers": {
      "Content-Type": "application/json"
    },
    "body": {
      "username": "testuser@example.com",
      "password": "Test@123456"
    }
  },
  "assertions": [
    {"type": "STATUS", "condition": "eq", "expected": 200},
    {"type": "JSON_PATH", "target": "$.code", "condition": "eq", "expected": 0},
    {"type": "JSON_PATH", "target": "$.data.token", "condition": "exists", "expected": true},
    {"type": "RESPONSE_TIME", "condition": "lt", "expected": 1000}
  ],
  "priority": "P0",
  "tags": ["登录", "核心流程"]
}
```

### 3.6 测试执行引擎

#### 执行模式

| 模式       | 说明                             | 适用场景     |
| :--------- | :------------------------------- | :----------- |
| 单接口执行 | 执行单个测试用例                 | 调试、验证   |
| 测试套件   | 批量执行一组用例                 | 回归测试     |
| 场景执行   | 按顺序执行多个接口，支持变量传递 | 业务流程测试 |
| 定时执行   | 按Cron表达式自动执行             | 监控、巡检   |

#### 执行流程

text

```
开始执行
    ↓
[选择环境] → 加载环境变量
    ↓
[加载用例] → 获取测试用例/场景
    ↓
[变量替换] → 替换 {{变量}} 为实际值
    ↓
[发送请求] → 并发/顺序发送HTTP请求
    ↓
[验证断言] → 比对实际结果与预期
    ↓
[保存结果] → 写入数据库
    ↓
[后处理] → 场景变量提取、清理
    ↓
[生成报告] → 汇总统计结果
    ↓
结束执行
```

#### 变量传递（场景测试）

typescript

```
// 场景定义：登录 → 创建订单 → 查询订单
const scenario = {
  steps: [
    {
      apiId: "api_login",
      extractRules: {
        "token": "$.data.token",        // 从登录响应提取token
        "userId": "$.data.user.id"
      }
    },
    {
      apiId: "api_create_order",
      request: {
        body: {
          "userId": "{{userId}}",       // 使用上一步提取的变量
          "productId": "prod_123",
          "quantity": 1
        }
      },
      extractRules: {
        "orderId": "$.data.orderId"
      }
    },
    {
      apiId: "api_get_order",
      request: {
        url: "{{baseUrl}}/orders/{{orderId}}",  // 使用变量
        headers: {
          "Authorization": "Bearer {{token}}"
        }
      }
    }
  ]
};
```

#### 执行控制

- **并发数控制**: 可配置最大并发请求数
- **超时设置**: 全局/单个用例超时时间
- **重试机制**: 失败自动重试，可配置重试次数
- **执行顺序**: 顺序执行/并行执行
- **中断策略**: 失败即停止/继续执行

### 3.7 测试报告

#### 报告内容

typescript

```
interface TestReport {
  id: string;
  projectId: string;
  name: string;           // 报告名称
  environment: string;    // 执行环境

  // 统计信息
  summary: {
    total: number;        // 总用例数
    passed: number;       // 通过数
    failed: number;       // 失败数
    skipped: number;      // 跳过数
    passRate: number;     // 通过率
    duration: number;     // 总耗时(ms)
    startTime: Date;
    endTime: Date;
  };

  // 性能指标
  performance: {
    avgResponseTime: number;
    minResponseTime: number;
    maxResponseTime: number;
    p95ResponseTime: number;
    p99ResponseTime: number;
    throughput: number;   // 请求数/秒
  };

  // 详细结果
  details: TestResult[];

  // 图表数据
  charts: {
    timeline: ChartData[];
    distribution: ChartData[];
    trend: ChartData[];
  };
}
```

#### 报告展示

text

```
┌─────────────────────────────────────────────────────────┐
│  测试报告: 电商API回归测试 - 2024-05-24 10:30           │
│  环境: TEST                                              │
├─────────────────────────────────────────────────────────┤
│  概览卡片                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │ 总用例   │ │ 通过     │ │ 失败     │ │ 通过率   │  │
│  │ 156     │ │ 142      │ │ 14       │ │ 91.0%    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│                                                         │
│  响应时间分布                                            │
│  ┌─────────────────────────────────────┐               │
│  │        [响应时间直方图]               │               │
│  │  平均: 234ms  P95: 567ms  P99: 892ms │               │
│  └─────────────────────────────────────┘               │
│                                                         │
│  失败用例列表                                            │
│  ┌─────────────────────────────────────┐               │
│  │ ❌ 登录接口 - 密码错误场景            │               │
│  │    预期: 401 实际: 200               │               │
│  ├─────────────────────────────────────┤               │
│  │ ❌ 创建订单 - 库存不足场景            │               │
│  │    预期: 400 实际: 500               │               │
│  └─────────────────────────────────────┘               │
│                                                         │
│  [导出报告] [AI分析失败原因] [重新执行]                 │
└─────────────────────────────────────────────────────────┘
```

#### 报告功能

| 功能     | 说明                 |
| :------- | :------------------- |
| 概览统计 | 关键指标卡片展示     |
| 趋势图表 | 历史执行趋势         |
| 失败分析 | 失败用例归类统计     |
| 性能分析 | 响应时间分布         |
| 导出功能 | HTML/PDF/JSON/Excel  |
| 对比分析 | 与历史报告对比       |
| 分享链接 | 生成可分享的报告链接 |

---

## 4. AI模块设计（可选插件）

### 4.1 AI功能开关机制

#### 设计原则

- **默认关闭**: 所有AI功能默认不开启
- **项目级控制**: 每个项目可独立开启/关闭AI
- **细粒度控制**: 可分别控制每个AI子功能
- **可插拔**: AI服务可随时接入/移除

#### 配置层级

typescript

```
// 系统级配置
interface SystemAIConfig {
  globalEnabled: boolean;           // 全局AI开关，默认false
  allowProjectConfig: boolean;      // 允许项目单独配置
  defaultProvider?: string;         // 默认AI提供商
}

// 项目级配置
interface ProjectAIConfig {
  projectId: string;
  enabled: boolean;                 // 项目AI开关，默认false
  providerId?: string;              // 使用的AI提供商

  // 各功能开关
  features: {
    testGeneration: boolean;        // 测试用例生成，默认false
    assertionGeneration: boolean;    // 断言生成，默认false
    errorAnalysis: boolean;          // 错误分析，默认false
    reportSummary: boolean;          // 报告总结，默认false
    semanticParse: boolean;          // 语义解析，默认false
  };

  // 模型参数
  modelConfig?: {
    temperature: number;             // 0-2，默认0.7
    maxTokens: number;               // 最大token数
    timeout: number;                 // 超时时间(ms)
  };
}
```

#### 前端状态管理

typescript

```
// store/ai.ts
interface AIState {
  // 配置状态
  configured: boolean;      // 是否已配置AI服务
  enabled: boolean;         // 当前项目是否启用AI
  available: boolean;       // AI服务是否可用

  // 各功能可用性
  features: {
    testGeneration: boolean;
    assertionGeneration: boolean;
    errorAnalysis: boolean;
    reportSummary: boolean;
    semanticParse: boolean;
  };

  // 使用统计
  usage: {
    today: number;          // 今日调用次数
    total: number;          // 总调用次数
    limit?: number;         // 调用限制（如有）
  };
}

const aiStore = {
  state: {
    configured: false,
    enabled: false,
    available: false,
    features: {...},
    usage: { today: 0, total: 0 }
  },

  // 检查AI服务健康状态
  async checkHealth() {
    try {
      const res = await api.get('/ai/health');
      this.state.available = res.available;
      this.state.features = res.features;
    } catch {
      this.state.available = false;
    }
  },

  // 获取AI功能，自动降级
  async getAIFeature<T>(feature: string, fallback: T): Promise<T> {
    // 未启用或不可用，直接返回降级方案
    if (!this.state.enabled || !this.state.available) {
      return fallback;
    }

    try {
      return await aiService.call(feature);
    } catch (error) {
      console.error(`AI feature ${feature} failed:`, error);
      return fallback; // 异常降级
    }
  }
};
```

### 4.2 AI服务健康检查

#### 健康检查机制

typescript

```
@Injectable()
export class AIHealthCheckService {
  private providerStatus: Map<string, ProviderHealth> = new Map();

  // 定时检查（每5分钟）
  @Cron('*/5 * * * *')
  async checkAllProviders() {
    const providers = await this.aiProviderRepository.find();

    for (const provider of providers) {
      const status = await this.checkProvider(provider);
      this.providerStatus.set(provider.id, status);

      // 更新数据库状态
      await this.aiProviderRepository.update(provider.id, {
        healthStatus: status,
        lastCheck: new Date()
      });
    }
  }

  // 检查单个提供商
  async checkProvider(provider: AIProvider): Promise<ProviderHealth> {
    const start = Date.now();

    try {
      // 发送测试请求
      const response = await this.httpService.axiosRef({
        url: provider.baseUrl + '/health',
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${provider.apiKey}`
        },
        timeout: 5000
      });

      return {
        available: true,
        latency: Date.now() - start,
        models: response.data.models || [],
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        available: false,
        error: error.message,
        latency: Date.now() - start,
        lastCheck: new Date()
      };
    }
  }

  // 获取可用提供商
  async getAvailableProvider(): Promise<AIProvider | null> {
    const providers = await this.aiProviderRepository.find({
      where: { isActive: true }
    });

    for (const provider of providers) {
      const status = this.providerStatus.get(provider.id);
      if (status?.available) {
        return provider;
      }
    }

    return null;
  }
}
```

### 4.3 AI配置界面

#### AI设置页面

text

```
┌─────────────────────────────────────────────────────────┐
│  AI服务配置                                    [返回]    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ☑ 启用AI辅助功能（项目级别）                            │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ AI提供商配置                                     │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 提供商类型: [OpenAI    ▼] [DeepSeek] [自定义]    │   │
│  │                                                  │   │
│  │ API地址: [https://api.openai.com/v1    ]        │   │
│  │ API密钥: [····························] [显示]   │   │
│  │ 模型:    [gpt-4o                     ▼]         │   │
│  │                                                  │   │
│  │ [测试连接]                        [保存配置]     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ AI功能开关                                        │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ ☑ 自动生成测试用例                                 │   │
│  │ ☑ 自动生成断言                                     │   │
│  │ ☑ 测试失败分析                                     │   │
│  │ ☑ 报告智能总结                                     │   │
│  │ ☐ 语义解析（增强标签分类）                          │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 模型参数                                         │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 温度(Temperature): [0.7    ] (0-2, 越低越确定)   │   │
│  │ 最大Token数:      [2000   ]                      │   │
│  │ 超时时间(秒):      [30     ]                     │   │
│  └─────────────────────────────────────────────────┘   │
│                                                          │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 用量统计                                         │   │
│  ├─────────────────────────────────────────────────┤   │
│  │ 今日调用: 156次                                   │   │
│  │ 本月调用: 3,245次                                 │   │
│  │ 预估费用: $12.45                                  │   │
│  │ [查看详情]                                        │   │
│  └─────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

#### AI功能引导弹窗

text

```
┌─────────────────────────────────────────────────────┐
│  ✨ AI测试生成                                       │
├─────────────────────────────────────────────────────┤
│                                                      │
│  AI可以为您：                                         │
│  • 根据API文档自动生成测试用例                         │
│  • 智能识别边界条件和异常场景                           │
│  • 生成数据验证断言                                   │
│                                                      │
│  当前项目未配置AI服务                                 │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ 立即配置 │  │ 稍后提醒 │  │ 不再显示(可设置在设置页)│
│  └──────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 4.4 AI功能降级策略

| AI功能           | 降级策略                           | 用户体验               |
| :--------------- | :--------------------------------- | :--------------------- |
| **测试用例生成** | 返回空数组，显示提示"AI服务不可用" | 手动创建或导入测试用例 |
| **断言生成**     | 返回基础断言（仅状态码200验证）    | 手动添加断言           |
| **失败分析**     | 只显示原始请求/响应，无分析建议    | 查看原始数据自行分析   |
| **报告总结**     | 只显示数据报表，无自然语言总结     | 查看统计图表           |
| **语义解析**     | 使用规则引擎简单分类               | API按标签分组          |

#### 降级实现示例

typescript

```
// 测试生成服务的降级实现
@Injectable()
export class TestGenerationService {
  constructor(
    private aiService: AIService,
    private ruleEngine: RuleEngineService
  ) {}

  async generateTests(apiId: string): Promise<TestCase[]> {
    const api = await this.apiRepository.findOne(apiId);
    const project = await this.projectRepository.findOne(api.projectId);

    // 检查AI是否可用
    if (project.aiEnabled && await this.aiService.isAvailable()) {
      try {
        // AI生成测试用例
        return await this.aiService.generateTests(api);
      } catch (error) {
        // AI失败，记录日志并降级
        this.logger.error('AI generation failed, using fallback', error);
        return this.getFallbackTests(api);
      }
    } else {
      // AI未启用或不可用，直接使用降级方案
      return this.getFallbackTests(api);
    }
  }

  // 降级方案：基于规则的简单测试生成
  private getFallbackTests(api: API): TestCase[] {
    const tests: TestCase[] = [];

    // 基础成功测试
    tests.push(this.createSuccessTestCase(api));

    // 根据参数类型生成基本测试
    for (const param of api.parameters) {
      if (param.required) {
        tests.push(this.createMissingParamTestCase(api, param));
      }

      if (param.type === 'string') {
        tests.push(this.createEmptyStringTestCase(api, param));
        tests.push(this.createLongStringTestCase(api, param));
      } else if (param.type === 'number') {
        tests.push(this.createZeroTestCase(api, param));
        tests.push(this.createNegativeTestCase(api, param));
      }
    }

    return tests;
  }
}
```

### 4.5 AI功能模块详解

#### 4.5.1 AI语义解析

**功能**: 理解API的业务含义，为测试生成提供上下文

typescript

```
// 输入：API定义
const api = {
  path: '/auth/login',
  method: 'POST',
  summary: '用户登录',
  parameters: [
    { name: 'username', type: 'string', description: '用户名/邮箱' },
    { name: 'password', type: 'string', description: '密码' }
  ],
  responses: {
    200: { description: '登录成功' },
    401: { description: '认证失败' }
  }
};

// AI输出：语义理解
{
  "fieldMeanings": {
    "username": "用户账号，可能是邮箱或手机号",
    "password": "用户密码，需要加密传输"
  },
  "businessContext": "用户认证流程的第一步",
  "sensitiveFields": ["password"],
  "suggestedTests": [
    "正确凭证登录",
    "错误密码登录",
    "不存在的用户名",
    "密码为空",
    "SQL注入尝试",
    "XSS攻击尝试"
  ]
}
```

#### 4.5.2 AI测试用例生成

**功能**: 基于API定义和语义理解，自动生成全面的测试用例

typescript

```
// AI生成的测试用例示例
[
  {
    "name": "正常登录 - 邮箱格式",
    "request": {
      "username": "test@example.com",
      "password": "Test@123456"
    },
    "expected": {
      "status": 200,
      "body": {
        "code": 0,
        "message": "success"
      }
    }
  },
  {
    "name": "正常登录 - 手机号格式",
    "request": {
      "username": "13800138000",
      "password": "Test@123456"
    },
    "expected": {
      "status": 200
    }
  },
  {
    "name": "密码错误",
    "request": {
      "username": "test@example.com",
      "password": "WrongPassword"
    },
    "expected": {
      "status": 401,
      "body": {
        "code": 1001,
        "message": "invalid credential"
      }
    }
  },
  {
    "name": "用户名为空",
    "request": {
      "username": "",
      "password": "Test@123456"
    },
    "expected": {
      "status": 400
    }
  },
  {
    "name": "SQL注入尝试",
    "request": {
      "username": "' OR '1'='1",
      "password": "' OR '1'='1"
    },
    "expected": {
      "status": 401
    }
  },
  {
    "name": "密码超长边界",
    "request": {
      "username": "test@example.com",
      "password": "a".repeat(100)
    },
    "expected": {
      "status": 400
    }
  }
]
```

#### 4.5.3 AI断言生成

**功能**: 根据响应示例自动生成验证断言

typescript

```
// 响应示例
const response = {
  status: 200,
  body: {
    code: 0,
    data: {
      token: "eyJhbGciOiJIUzI1NiIs...",
      user: {
        id: 10086,
        name: "张三",
        email: "zhangsan@example.com",
        createdAt: "2024-01-01T10:00:00Z"
      }
    }
  }
};

// AI生成的断言
[
  { type: "STATUS", condition: "eq", expected: 200 },
  { type: "JSON_PATH", target: "$.code", condition: "eq", expected: 0 },
  { type: "JSON_PATH", target: "$.data.token", condition: "exists", expected: true },
  { type: "JSON_PATH", target: "$.data.token", condition: "matches", expected: "^eyJ.*" },
  { type: "JSON_PATH", target: "$.data.user.id", condition: "eq", expected: 10086 },
  { type: "JSON_PATH", target: "$.data.user.name", condition: "eq", expected: "张三" },
  { type: "JSON_PATH", target: "$.data.user.email", condition: "matches", expected: "^[^@]+@[^@]+\\.[^@]+$" },
  { type: "JSON_PATH", target: "$.data.user.createdAt", condition: "matches", expected: "^\\d{4}-\\d{2}-\\d{2}T" },
  { type: "RESPONSE_TIME", condition: "lt", expected: 1000 }
]
```

#### 4.5.4 AI失败分析

**功能**: 分析测试失败原因，提供修复建议

typescript

```
// 输入：失败的测试请求和响应
const failedTest = {
  request: {
    method: "POST",
    url: "https://api.example.com/auth/login",
    headers: {
      "Content-Type": "application/json"
    },
    body: {
      "user_name": "test@example.com",  // 注意字段名错误
      "password": "Test@123456"
    }
  },
  response: {
    status: 400,
    body: {
      "error": "Bad Request",
      "message": "Missing required field: username"
    }
  },
  api: {
    path: "/auth/login",
    method: "POST",
    parameters: [
      { name: "username", required: true },
      { name: "password", required: true }
    ]
  }
};

// AI分析结果
{
  "analysis": {
    "rootCause": "请求参数与API定义不匹配",
    "details": "API需要username字段，但请求中发送的是user_name字段",
    "confidence": 0.95
  },
  "suggestions": [
    {
      "type": "fix_request",
      "description": "将请求中的user_name改为username",
      "example": {
        "username": "test@example.com",
        "password": "Test@123456"
      }
    },
    {
      "type": "check_api_doc",
      "description": "确认API文档是否正确，可能需要更新文档"
    }
  ],
  "similar_issues": [
    {
      "test_case": "登录接口-字段错误",
      "solution": "修正字段名"
    }
  ]
}
```

#### 4.5.5 AI报告总结

**功能**: 将测试报告数据转化为自然语言总结

typescript

```
// 输入：测试报告数据
const reportData = {
  summary: {
    total: 156,
    passed: 142,
    failed: 14,
    passRate: 91.0
  },
  performance: {
    avgResponseTime: 234,
    p95ResponseTime: 567,
    slowestApis: [
      { name: "导出报表", time: 2345 },
      { name: "批量下单", time: 1890 }
    ]
  },
  failures: [
    { api: "登录接口", count: 3, pattern: "密码错误" },
    { api: "创建订单", count: 5, pattern: "库存不足" },
    { api: "支付接口", count: 6, pattern: "超时" }
  ]
};

// AI生成的报告总结
{
  "summary": {
    "short": "本次回归测试通过率91%，主要问题集中在支付接口超时和订单系统库存验证。",
    "detailed": "共执行156个测试用例，通过142个，失败14个，通过率91.0%。平均响应时间234ms，P95响应时间567ms，整体性能良好。"
  },
  "highlights": [
    "核心登录接口稳定性良好，失败率仅1.2%",
    "订单创建接口存在5个库存相关失败，建议检查库存服务",
    "支付接口响应时间较上周增加35%，需要关注"
  ],
  "risk_assessment": {
    "level": "MEDIUM",
    "description": "支付和订单系统存在中等风险，建议优先修复",
    "recommendations": [
      "检查支付网关超时配置",
      "验证库存扣减逻辑",
      "review最近一周的代码变更"
    ]
  },
  "trend": "相比上周通过率下降2.3%，主要由于新增的库存校验逻辑"
}
```

---

## 5. 数据库设计

### 5.1 核心业务表

#### projects (项目表)

sql

```
CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP,

    INDEX idx_projects_created_by (created_by),
    INDEX idx_projects_deleted_at (deleted_at)
);
```

#### apis (API表)

sql

```
CREATE TABLE apis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path VARCHAR(500) NOT NULL,
    method VARCHAR(10) NOT NULL,
    summary VARCHAR(500),
    description TEXT,
    tags JSONB, -- ["user", "auth"]

    -- 请求定义
    parameters JSONB, -- 完整参数定义
    request_body JSONB, -- 请求体schema

    -- 响应定义
    responses JSONB, -- 所有响应码的定义

    -- 元数据
    version VARCHAR(50),
    deprecated BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_apis_project (project_id),
    INDEX idx_apis_path_method (path, method),
    UNIQUE KEY uk_apis_project_path_method (project_id, path, method)
);
```

#### environments (环境表)

sql

```
CREATE TABLE environments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    base_url VARCHAR(500) NOT NULL,
    description TEXT,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_environments_project (project_id),
    UNIQUE KEY uk_environments_project_name (project_id, name)
);
```

#### environment_variables (环境变量表)

sql

```
CREATE TABLE environment_variables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    environment_id UUID NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
    key VARCHAR(200) NOT NULL,
    value TEXT NOT NULL,
    value_type VARCHAR(20) DEFAULT 'string', -- string, number, boolean, secret
    description TEXT,
    is_secret BOOLEAN DEFAULT false, -- 敏感数据，前端不显示
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_env_vars_environment (environment_id),
    UNIQUE KEY uk_env_vars_env_key (environment_id, key)
);
```

#### test_cases (测试用例表)

sql

```
CREATE TABLE test_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    api_id UUID REFERENCES apis(id) ON DELETE SET NULL,
    name VARCHAR(500) NOT NULL,
    description TEXT,

    -- 请求定义
    request JSONB NOT NULL, -- method, url, headers, query, body, auth

    -- 断言定义
    assertions JSONB, -- 断言数组

    -- 执行配置
    setup JSONB, -- 前置操作
    teardown JSONB, -- 后置操作

    -- 元数据
    priority VARCHAR(10) DEFAULT 'P2', -- P0, P1, P2, P3
    tags JSONB, -- 标签数组
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_test_cases_project (project_id),
    INDEX idx_test_cases_api (api_id),
    INDEX idx_test_cases_priority (priority)
);
```

#### scenarios (测试场景表)

sql

```
CREATE TABLE scenarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,

    -- 场景配置
    steps JSONB NOT NULL, -- 步骤数组，包含api_id, request, extract_rules等

    -- 元数据
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_scenarios_project (project_id)
);
```

#### test_runs (测试执行记录表)

sql

```
CREATE TABLE test_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(500),

    -- 执行信息
    environment_id UUID REFERENCES environments(id),
    status VARCHAR(20) DEFAULT 'running', -- running, success, failed, stopped
    trigger_type VARCHAR(20), -- manual, cron, api

    -- 统计
    total_count INTEGER DEFAULT 0,
    passed_count INTEGER DEFAULT 0,
    failed_count INTEGER DEFAULT 0,
    skipped_count INTEGER DEFAULT 0,

    -- 时间
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    duration INTEGER, -- 毫秒

    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_test_runs_project (project_id),
    INDEX idx_test_runs_status (status),
    INDEX idx_test_runs_created (created_at)
);
```

#### test_results (测试结果详情表)

sql

```
CREATE TABLE test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,

    -- 关联信息
    test_case_id UUID REFERENCES test_cases(id),
    api_id UUID REFERENCES apis(id),

    -- 执行结果
    status VARCHAR(20) NOT NULL, -- pass, fail, error, skipped

    -- 请求/响应
    request JSONB,
    response JSONB,

    -- 性能
    response_time INTEGER, -- 毫秒
    response_size INTEGER, -- 字节

    -- 验证结果
    assertions_result JSONB, -- 每个断言的执行结果

    -- 错误信息
    error_message TEXT,
    error_stack TEXT,

    -- 日志
    logs TEXT,

    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_test_results_run (run_id),
    INDEX idx_test_results_status (status)
);
```

### 5.2 AI相关表

#### ai_providers (AI提供商配置表)

sql

```
CREATE TABLE ai_providers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    provider_type VARCHAR(50) NOT NULL, -- openai, deepseek, azure, custom
    base_url VARCHAR(500) NOT NULL,
    api_key TEXT NOT NULL, -- 加密存储
    api_version VARCHAR(50), -- API版本

    -- 状态
    is_active BOOLEAN DEFAULT false,
    health_status JSONB, -- 健康状态缓存

    -- 限流配置
    rate_limit INTEGER, -- 每分钟请求数
    monthly_limit INTEGER, -- 每月token限制

    -- 元数据
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_ai_providers_active (is_active)
);
```

#### ai_models (AI模型表)

sql

```
CREATE TABLE ai_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id UUID NOT NULL REFERENCES ai_providers(id) ON DELETE CASCADE,
    model_name VARCHAR(200) NOT NULL,
    display_name VARCHAR(200),

    -- 能力
    capabilities JSONB, -- ["text", "vision", "function_calling"]

    -- 限制
    max_tokens INTEGER,
    max_context_length INTEGER,

    -- 计费
    input_price_per_1k DECIMAL(10,6), -- USD
    output_price_per_1k DECIMAL(10,6), -- USD

    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_ai_models_provider (provider_id)
);
```

#### project_ai_configs (项目AI配置表)

sql

```
CREATE TABLE project_ai_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,

    -- AI开关
    ai_enabled BOOLEAN DEFAULT false,
    provider_id UUID REFERENCES ai_providers(id),
    model_id UUID REFERENCES ai_models(id),

    -- 功能开关
    features JSONB NOT NULL DEFAULT '{
        "testGeneration": false,
        "assertionGeneration": false,
        "errorAnalysis": false,
        "reportSummary": false,
        "semanticParse": false
    }',

    -- 模型参数
    model_config JSONB DEFAULT '{
        "temperature": 0.7,
        "maxTokens": 2000,
        "timeout": 30
    }',

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),

    UNIQUE KEY uk_project_ai_configs_project (project_id),
    INDEX idx_project_ai_configs_enabled (ai_enabled)
);
```

#### ai_usage_logs (AI使用日志表)

sql

```
CREATE TABLE ai_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id),
    provider_id UUID REFERENCES ai_providers(id),

    -- 使用信息
    feature VARCHAR(50) NOT NULL, -- test_generation, assertion_generation, etc.
    tokens_input INTEGER,
    tokens_output INTEGER,
    tokens_total INTEGER,

    -- 性能
    response_time_ms INTEGER,
    success BOOLEAN DEFAULT true,

    -- 错误
    error_code VARCHAR(50),
    error_message TEXT,

    -- 费用估算
    estimated_cost DECIMAL(10,6),

    created_at TIMESTAMP DEFAULT NOW(),

    INDEX idx_ai_usage_project (project_id),
    INDEX idx_ai_usage_created (created_at),
    INDEX idx_ai_usage_feature (feature)
);
```

### 5.3 ER图概览

text

```
┌───────────┐       ┌───────────┐       ┌───────────┐
│ projects  │───────│   apis    │       │ test_cases│
│           │       │           │       │           │
└───────────┘       └───────────┘       └───────────┘
      │                                      │
      │                                      │
      ▼                                      ▼
┌───────────┐       ┌───────────┐       ┌───────────┐
│environments│───────│ test_runs │───────│test_results│
│           │       │           │       │           │
└───────────┘       └───────────┘       └───────────┘
      │                                      ▲
      │                                      │
      ▼                                      │
┌───────────┐       ┌───────────┐       ┌───────────┐
│env_vars   │       │ scenarios │───────│scenario_   │
│           │       │           │       │steps      │
└───────────┘       └───────────┘       └───────────┘

                    AI相关表
              ┌─────────────────┐
              │  ai_providers   │
              │                 │
              └─────────────────┘
                      │
                      ▼
              ┌─────────────────┐
              │   ai_models     │
              │                 │
              └─────────────────┘
                      │
                      ▼
              ┌─────────────────┐
              │project_ai_configs│
              │                 │
              └─────────────────┘
                      │
                      ▼
              ┌─────────────────┐
              │ ai_usage_logs   │
              │                 │
              └─────────────────┘
```

---

## 6. 前端设计

### 6.1 技术栈

| 类别     | 技术          | 版本    | 用途     |
| :------- | :------------ | :------ | :------- |
| 框架     | Vue 3         | ^3.3.0  | 核心框架 |
| 语言     | TypeScript    | ^5.0.0  | 类型安全 |
| 构建     | Vite          | ^4.0.0  | 快速构建 |
| 状态管理 | Pinia         | ^2.1.0  | 状态管理 |
| UI组件   | Element Plus  | ^2.4.0  | 基础组件 |
| 可视化   | ECharts       | ^5.4.0  | 图表展示 |
| HTTP     | Axios         | ^1.4.0  | 网络请求 |
| 编辑器   | Monaco Editor | ^0.39.0 | JSON编辑 |
| 表单     | VeeValidate   | ^4.0.0  | 表单验证 |
| 路由     | Vue Router    | ^4.2.0  | 路由管理 |
| 工具库   | Lodash        | ^4.17.0 | 工具函数 |
| 日期     | Day.js        | ^1.11.0 | 日期处理 |

### 6.2 目录结构

text

```
frontend/
├── public/                 # 静态资源
├── src/
│   ├── api/                # API接口层
│   │   ├── project.ts      # 项目管理接口
│   │   ├── api.ts          # API管理接口
│   │   ├── test.ts         # 测试执行接口
│   │   ├── report.ts       # 报告接口
│   │   ├── environment.ts  # 环境接口
│   │   └── ai.ts           # AI功能接口
│   │
│   ├── assets/             # 资源文件
│   │   ├── styles/         # 全局样式
│   │   ├── images/         # 图片
│   │   └── icons/          # 图标
│   │
│   ├── components/         # 公共组件
│   │   ├── common/         # 通用组件
│   │   │   ├── Table.vue
│   │   │   ├── Form.vue
│   │   │   └── Modal.vue
│   │   ├── layout/         # 布局组件
│   │   │   ├── Sidebar.vue
│   │   │   ├── Header.vue
│   │   │   └── Content.vue
│   │   └── ai/             # AI相关组件
│   │       ├── AIButton.vue        # AI功能按钮
│   │       ├── AIPrompt.vue        # AI配置引导
│   │       ├── AISuggestion.vue    # AI建议展示
│   │       └── AILoading.vue       # AI加载状态
│   │
│   ├── composables/        # 组合式函数
│   │   ├── useProject.ts   # 项目相关逻辑
│   │   ├── useTest.ts      # 测试相关逻辑
│   │   ├── useAI.ts        # AI相关逻辑
│   │   └── useTheme.ts     # 主题相关
│   │
│   ├── pages/              # 页面组件
│   │   ├── dashboard/      # 仪表盘
│   │   │   └── Dashboard.vue
│   │   │
│   │   ├── project/        # 项目管理
│   │   │   ├── ProjectList.vue
│   │   │   ├── ProjectDetail.vue
│   │   │   └── ProjectSettings.vue
│   │   │
│   │   ├── api/            # API管理
│   │   │   ├── APIList.vue
│   │   │   ├── APIDetail.vue
│   │   │   ├── APIDebug.vue
│   │   │   └── ImportSwagger.vue
│   │   │
│   │   ├── test/           # 测试管理
│   │   │   ├── TestCaseList.vue
│   │   │   ├── TestCaseDetail.vue
│   │   │   ├── ScenarioList.vue
│   │   │   ├── ScenarioDetail.vue
│   │   │   └── TestExecute.vue
│   │   │
│   │   ├── environment/    # 环境管理
│   │   │   ├── EnvironmentList.vue
│   │   │   └── EnvironmentDetail.vue
│   │   │
│   │   ├── report/         # 报告管理
│   │   │   ├── ReportList.vue
│   │   │   └── ReportDetail.vue
│   │   │
│   │   └── settings/       # 设置
│   │       ├── Profile.vue
│   │       ├── Team.vue
│   │       └── AISettings.vue   # AI配置页面
│   │
│   ├── router/             # 路由配置
│   │   ├── index.ts
│   │   └── guards.ts
│   │
│   ├── store/              # 状态管理
│   │   ├── index.ts
│   │   ├── project.ts      # 项目状态
│   │   ├── user.ts         # 用户状态
│   │   ├── environment.ts  # 环境状态
│   │   └── ai.ts           # AI状态
│   │
│   ├── types/              # TypeScript类型
│   │   ├── project.d.ts
│   │   ├── api.d.ts
│   │   ├── test.d.ts
│   │   └── ai.d.ts
│   │
│   ├── utils/              # 工具函数
│   │   ├── request.ts      # HTTP请求封装
│   │   ├── storage.ts      # 本地存储
│   │   ├── format.ts       # 格式化
│   │   └── validator.ts    # 验证器
│   │
│   ├── App.vue             # 根组件
│   └── main.ts             # 入口文件
│
├── index.html
├── vite.config.ts          # Vite配置
├── tsconfig.json           # TypeScript配置
└── package.json
```

### 6.3 页面路由设计

typescript

```
// router/index.ts
const routes = [
  {
    path: '/',
    component: Layout,
    redirect: '/dashboard',
    children: [
      { path: 'dashboard', component: Dashboard },

      // 项目管理
      {
        path: 'projects',
        component: ProjectList,
        meta: { title: '项目管理' }
      },
      {
        path: 'projects/:id',
        component: ProjectDetail,
        children: [
          { path: '', redirect: 'apis' },
          { path: 'apis', component: APIList },
          { path: 'apis/:apiId', component: APIDetail },
          { path: 'apis/:apiId/debug', component: APIDebug },
          { path: 'tests', component: TestCaseList },
          { path: 'tests/:testId', component: TestCaseDetail },
          { path: 'scenarios', component: ScenarioList },
          { path: 'scenarios/:scenarioId', component: ScenarioDetail },
          { path: 'environments', component: EnvironmentList },
          { path: 'reports', component: ReportList },
          { path: 'reports/:reportId', component: ReportDetail },
          { path: 'settings', component: ProjectSettings }
        ]
      },

      // 全局设置
      {
        path: 'settings',
        component: Settings,
        children: [
          { path: 'profile', component: Profile },
          { path: 'team', component: Team },
          { path: 'ai', component: AISettings }  // AI配置
        ]
      }
    ]
  },

  // 独立页面
  { path: '/test-execute/:runId', component: TestExecute },
  { path: '/login', component: Login },
  { path: '/register', component: Register }
];
```

### 6.4 AI状态管理

typescript

```
// store/ai.ts
import { defineStore } from 'pinia';
import { ref, computed } from 'vue';

interface AIState {
  configured: boolean;
  enabled: boolean;
  available: boolean;
  features: Record<string, boolean>;
  usage: {
    today: number;
    total: number;
    limit?: number;
  };
  provider: {
    name: string;
    model: string;
  } | null;
}

export const useAIStore = defineStore('ai', () => {
  // state
  const configured = ref(false);
  const enabled = ref(false);
  const available = ref(false);
  const features = ref({
    testGeneration: false,
    assertionGeneration: false,
    errorAnalysis: false,
    reportSummary: false,
    semanticParse: false
  });
  const usage = ref({ today: 0, total: 0 });
  const provider = ref(null);

  // getters
  const canUseAI = computed(() => {
    return enabled.value && available.value && configured.value;
  });

  const canUseFeature = (feature: string) => {
    return canUseAI.value && features.value[feature];
  };

  // actions
  async function checkHealth() {
    try {
      const res = await api.get('/ai/health');
      available.value = res.available;
      features.value = res.features;

      // 更新提供商信息
      if (res.provider) {
        provider.value = res.provider;
        configured.value = true;
      }
    } catch {
      available.value = false;
    }
  }

  async function fetchConfig() {
    try {
      const res = await api.get('/ai/config');
      enabled.value = res.aiEnabled;
      features.value = res.features;
      provider.value = res.provider;
      configured.value = !!res.provider;
    } catch (error) {
      console.error('Failed to fetch AI config:', error);
    }
  }

  async function updateConfig(config: any) {
    try {
      await api.put('/ai/config', config);
      await fetchConfig();
    } catch (error) {
      console.error('Failed to update AI config:', error);
      throw error;
    }
  }

  // AI功能调用（自动降级）
  async function callAIFeature<T>(
    feature: string,
    params: any,
    fallback: T
  ): Promise<T> {
    if (!canUseFeature(feature)) {
      return fallback;
    }

    try {
      const result = await api.post(`/ai/${feature}`, params);
      usage.value.today += 1;
      usage.value.total += 1;
      return result.data;
    } catch (error) {
      console.error(`AI feature ${feature} failed:`, error);
      return fallback;
    }
  }

  return {
    // state
    configured,
    enabled,
    available,
    features,
    usage,
    provider,

    // getters
    canUseAI,
    canUseFeature,

    // actions
    checkHealth,
    fetchConfig,
    updateConfig,
    callAIFeature
  };
});
```

---

## 7. 后端设计

### 7.1 技术栈

| 类别 | 技术               | 版本    | 用途        |
| :--- | :----------------- | :------ | :---------- |
| 框架 | NestJS             | ^10.0.0 | 后端框架    |
| 语言 | TypeScript         | ^5.0.0  | 开发语言    |
| ORM  | TypeORM            | ^0.3.17 | 数据库ORM   |
| 验证 | class-validator    | ^0.14.0 | DTO验证     |
| 队列 | BullMQ             | ^4.0.0  | 任务队列    |
| 缓存 | ioredis            | ^5.3.0  | Redis客户端 |
| 日志 | Winston            | ^3.9.0  | 日志记录    |
| 文档 | Swagger            | ^7.0.0  | API文档     |
| 安全 | Helmet             | ^7.0.0  | 安全头      |
| 限流 | express-rate-limit | ^6.7.0  | 接口限流    |

### 7.2 模块划分

text

```
backend/
├── src/
│   ├── main.ts                 # 入口文件
│   ├── app.module.ts           # 根模块
│   │
│   ├── common/                  # 公共模块
│   │   ├── constants/           # 常量定义
│   │   ├── decorators/          # 自定义装饰器
│   │   ├── filters/             # 异常过滤器
│   │   ├── guards/              # 守卫
│   │   ├── interceptors/        # 拦截器
│   │   ├── middleware/          # 中间件
│   │   └── pipes/               # 管道
│   │
│   ├── modules/                  # 业务模块
│   │   ├── project/              # 项目管理
│   │   │   ├── project.controller.ts
│   │   │   ├── project.service.ts
│   │   │   ├── project.entity.ts
│   │   │   ├── project.dto.ts
│   │   │   └── project.module.ts
│   │   │
│   │   ├── api/                  # API管理
│   │   │   ├── api.controller.ts
│   │   │   ├── api.service.ts
│   │   │   ├── api.entity.ts
│   │   │   ├── api.dto.ts
│   │   │   ├── parser/           # 文档解析器
│   │   │   │   ├── swagger.parser.ts
│   │   │   │   ├── postman.parser.ts
│   │   │   │   └── har.parser.ts
│   │   │   └── api.module.ts
│   │   │
│   │   ├── environment/          # 环境管理
│   │   │   ├── environment.controller.ts
│   │   │   ├── environment.service.ts
│   │   │   ├── environment.entity.ts
│   │   │   ├── variable.entity.ts
│   │   │   └── environment.module.ts
│   │   │
│   │   ├── test/                 # 测试管理
│   │   │   ├── test.controller.ts
│   │   │   ├── test.service.ts
│   │   │   ├── test-case.entity.ts
│   │   │   ├── scenario.entity.ts
│   │   │   └── test.module.ts
│   │   │
│   │   ├── runner/               # 测试执行引擎
│   │   │   ├── runner.controller.ts
│   │   │   ├── runner.service.ts
│   │   │   ├── executor.service.ts
│   │   │   ├── assertion.service.ts
│   │   │   ├── variable-replacer.service.ts
│   │   │   └── runner.module.ts
│   │   │
│   │   ├── report/               # 报告管理
│   │   │   ├── report.controller.ts
│   │   │   ├── report.service.ts
│   │   │   ├── report.entity.ts
│   │   │   ├── result.entity.ts
│   │   │   ├── generator.service.ts
│   │   │   └── report.module.ts
│   │   │
│   │   ├── ai/                    # AI模块（可选插件）
│   │   │   ├── ai.controller.ts
│   │   │   ├── ai.service.ts
│   │   │   ├── provider/          # AI提供商适配
│   │   │   │   ├── ai-provider.interface.ts
│   │   │   │   ├── openai.provider.ts
│   │   │   │   ├── deepseek.provider.ts
│   │   │   │   └── custom.provider.ts
│   │   │   ├── features/          # AI功能实现
│   │   │   │   ├── test-generator.service.ts
│   │   │   │   ├── assertion-generator.service.ts
│   │   │   │   ├── error-analyzer.service.ts
│   │   │   │   ├── report-summarizer.service.ts
│   │   │   │   └── semantic-parser.service.ts
│   │   │   ├── health/            # 健康检查
│   │   │   │   └── health-check.service.ts
│   │   │   ├── entities/          # AI相关实体
│   │   │   │   ├── ai-provider.entity.ts
│   │   │   │   ├── ai-model.entity.ts
│   │   │   │   ├── project-ai-config.entity.ts
│   │   │   │   └── ai-usage-log.entity.ts
│   │   │   └── ai.module.ts
│   │   │
│   │   ├── queue/                 # 队列管理
│   │   │   ├── queue.service.ts
│   │   │   ├── test-queue.processor.ts
│   │   │   └── queue.module.ts
│   │   │
│   │   └── user/                  # 用户管理
│   │       ├── user.controller.ts
│   │       ├── user.service.ts
│   │       ├── user.entity.ts
│   │       └── user.module.ts
│   │
│   ├── config/                    # 配置
│   │   ├── database.config.ts
│   │   ├── redis.config.ts
│   │   └── ai.config.ts           # AI配置
│   │
│   └── shared/                    # 共享工具
│       ├── utils/
│       └── helpers/
│
├── test/                          # 测试
├── .env.example
├── package.json
└── tsconfig.json
```

### 7.3 API设计

#### 核心API概览

| 模块         | 方法   | 路径                              | 说明             |
| :----------- | :----- | :-------------------------------- | :--------------- |
| **项目**     | GET    | /projects                         | 获取项目列表     |
|              | POST   | /projects                         | 创建项目         |
|              | GET    | /projects/:id                     | 获取项目详情     |
|              | PUT    | /projects/:id                     | 更新项目         |
|              | DELETE | /projects/:id                     | 删除项目         |
|              | GET    | /projects/:id/stats               | 项目统计         |
|              |        |                                   |                  |
| **API管理**  | GET    | /projects/:projectId/apis         | 获取API列表      |
|              | POST   | /projects/:projectId/apis/import  | 导入文档         |
|              | GET    | /apis/:id                         | 获取API详情      |
|              | PUT    | /apis/:id                         | 更新API          |
|              | DELETE | /apis/:id                         | 删除API          |
|              | POST   | /apis/:id/debug                   | 调试API          |
|              |        |                                   |                  |
| **环境**     | GET    | /projects/:projectId/environments | 获取环境列表     |
|              | POST   | /projects/:projectId/environments | 创建环境         |
|              | PUT    | /environments/:id                 | 更新环境         |
|              | DELETE | /environments/:id                 | 删除环境         |
|              | GET    | /environments/:id/variables       | 获取变量         |
|              | POST   | /environments/:id/variables       | 添加变量         |
|              |        |                                   |                  |
| **测试用例** | GET    | /projects/:projectId/test-cases   | 获取用例列表     |
|              | POST   | /projects/:projectId/test-cases   | 创建用例         |
|              | GET    | /test-cases/:id                   | 获取用例         |
|              | PUT    | /test-cases/:id                   | 更新用例         |
|              | DELETE | /test-cases/:id                   | 删除用例         |
|              |        |                                   |                  |
| **测试执行** | POST   | /test-runs                        | 创建测试执行     |
|              | GET    | /test-runs/:id                    | 获取执行状态     |
|              | POST   | /test-runs/:id/stop               | 停止执行         |
|              | GET    | /test-runs/:id/results            | 获取执行结果     |
|              |        |                                   |                  |
| **报告**     | GET    | /projects/:projectId/reports      | 获取报告列表     |
|              | GET    | /reports/:id                      | 获取报告详情     |
|              | GET    | /reports/:id/export               | 导出报告         |
|              |        |                                   |                  |
| **AI功能**   | GET    | /ai/health                        | AI服务健康检查   |
|              | GET    | /ai/config                        | 获取AI配置       |
|              | PUT    | /ai/config                        | 更新AI配置       |
|              | POST   | /ai/generate-tests                | AI生成测试用例   |
|              | POST   | /ai/generate-assertions           | AI生成断言       |
|              | POST   | /ai/analyze-error                 | AI分析错误       |
|              | POST   | /ai/summarize-report              | AI总结报告       |
|              | GET    | /ai/providers                     | 获取AI提供商列表 |
|              | POST   | /ai/providers                     | 添加AI提供商     |
|              | GET    | /ai/usage                         | 获取使用统计     |

#### AI配置API示例

typescript

```
// ai.controller.ts
@Controller('ai')
export class AIController {
  constructor(private readonly aiService: AIService) {}

  // 健康检查
  @Get('health')
  async checkHealth() {
    const health = await this.aiService.checkHealth();
    return {
      available: health.available,
      features: health.features,
      provider: health.provider
    };
  }

  // 获取项目AI配置
  @Get('config')
  async getConfig(@User() user, @ProjectId() projectId: string) {
    const config = await this.aiService.getProjectConfig(projectId);
    return {
      aiEnabled: config.aiEnabled,
      features: config.features,
      provider: config.provider ? {
        name: config.provider.name,
        model: config.model?.modelName
      } : null
    };
  }

  // 更新项目AI配置
  @Put('config')
  async updateConfig(
    @User() user,
    @ProjectId() projectId: string,
    @Body() updateConfigDto: UpdateAIConfigDto
  ) {
    return this.aiService.updateProjectConfig(projectId, updateConfigDto);
  }

  // AI生成测试用例
  @Post('generate-tests')
  async generateTests(
    @User() user,
    @Body() generateTestsDto: GenerateTestsDto
  ) {
    // 检查AI是否可用
    const canUse = await this.aiService.canUseFeature(
      generateTestsDto.projectId,
      'testGeneration'
    );

    if (!canUse) {
      // AI不可用，返回降级方案
      return this.aiService.getFallbackTests(generateTestsDto.apiId);
    }

    try {
      return await this.aiService.generateTests(generateTestsDto);
    } catch (error) {
      // 记录错误，返回降级方案
      await this.aiService.logError(error);
      return this.aiService.getFallbackTests(generateTestsDto.apiId);
    }
  }
}
```

### 7.4 任务调度

#### BullMQ队列配置

typescript

```
// queue.module.ts
@Module({
  imports: [
    BullModule.forRoot({
      redis: {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT),
        password: process.env.REDIS_PASSWORD
      }
    }),
    BullModule.registerQueue(
      {
        name: 'test-execution',
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000
          },
          removeOnComplete: 100,
          removeOnFail: 500
        }
      },
      {
        name: 'ai-generation',
        defaultJobOptions: {
          attempts: 2,
          timeout: 60000, // 60秒
          removeOnComplete: true
        }
      }
    )
  ],
  providers: [TestQueueProcessor, AIQueueProcessor],
  exports: [BullModule]
})
export class QueueModule {}
```

#### 测试执行队列处理器

typescript

```
// test-queue.processor.ts
@Processor('test-execution')
export class TestQueueProcessor {
  constructor(
    private readonly executorService: ExecutorService,
    private readonly reportService: ReportService
  ) {}

  @Process()
  async processTestRun(job: Job) {
    const { runId, projectId, environmentId, testCaseIds } = job.data;

    try {
      // 更新任务进度
      await job.progress(10);

      // 执行测试
      const results = await this.executorService.execute({
        runId,
        projectId,
        environmentId,
        testCaseIds
      });

      await job.progress(80);

      // 生成报告
      const report = await this.reportService.generateReport(runId, results);

      await job.progress(100);

      return { report, results };
    } catch (error) {
      await this.executorService.markRunFailed(runId, error);
      throw error;
    }
  }

  // 处理并发控制
  @OnQueueActive()
  onActive(job: Job) {
    console.log(`Processing job ${job.id} of type ${job.name}`);
  }

  @OnQueueCompleted()
  onComplete(job: Job, result: any) {
    console.log(`Job ${job.id} completed`);
  }

  @OnQueueFailed()
  onError(job: Job, error: Error) {
    console.error(`Job ${job.id} failed:`, error);
  }
}
```

---

## 8. 业务流程

### 8.1 核心业务流（无AI）

text

```
┌─────────────────────────────────────────────────────────────────┐
│                      项目管理流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │
│  │ 创建项目 │───▶│导入Swagger│───▶│查看API  │───▶│手动调试 │      │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘      │
│                                                      │          │
│                                                      ▼          │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐      │
│  │ 查看报告 │◀───│ 执行测试 │◀───│ 创建用例 │◀───│ 保存用例 │      │
│  └─────────┘    └─────────┘    └─────────┘    └─────────┘      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

详细步骤：
1. 用户登录 → 创建项目
2. 导入 Swagger/OpenAPI 文档 → 系统解析API
3. 查看API列表 → 选择接口调试
4. 手动调试接口 → 验证响应
5. 点击"保存为测试用例" → 填写用例信息
6. 手动添加断言 → 保存测试用例
7. 选择测试环境 → 执行测试
8. 查看测试报告 → 分析结果
9. 根据失败结果 → 修改测试用例
```

### 8.2 AI增强业务流

text

```
┌─────────────────────────────────────────────────────────────────┐
│                      AI增强流程（可选）                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐                                                     │
│  │导入Swagger│                                                     │
│  └────┬────┘                                                     │
│       ▼                                                          │
│  ┌──────────────┐            ┌─────────────────┐                │
│  │  AI语义解析   │───────────▶│ 自动添加标签分类 │                │
│  └──────┬───────┘            └─────────────────┘                │
│         ▼                                                        │
│  ┌──────────────┐                                                │
│  │AI生成测试建议 │                                                │
│  └──────┬───────┘                                                │
│         ▼                                                        │
│  ┌───────────────────────┐                                       │
│  │ 展示AI建议列表         │                                       │
│  │ ┌─────────────────┐   │                                       │
│  │ │☑ 正常登录       │   │                                       │
│  │ │☑ 密码为空       │   │                                       │
│  │ │☑ SQL注入        │   │                                       │
│  │ │☐ XSS攻击        │   │                                       │
│  │ └─────────────────┘   │                                       │
│  │ [采纳选中] [全部采纳]  │                                       │
│  └───────────┬───────────┘                                       │
│              ▼                                                    │
│  ┌─────────────────────┐        ┌─────────────────┐             │
│  │ 自动生成测试用例     │───────▶│ AI生成断言      │             │
│  └─────────────────────┘        └────────┬────────┘             │
│                                          ▼                        │
│  ┌─────────────────────┐        ┌─────────────────┐             │
│  │ 执行测试           │───────▶│ AI分析失败原因  │             │
│  └─────────────────────┘        └────────┬────────┘             │
│                                          ▼                        │
│  ┌─────────────────────┐        ┌─────────────────┐             │
│  │ 生成报告           │───────▶│ AI总结报告      │             │
│  └─────────────────────┘        └─────────────────┘             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.3 降级流程

text

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI降级流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  用户点击"AI生成测试用例"                                          │
│              │                                                    │
│              ▼                                                    │
│  ┌─────────────────────────┐                                     │
│  │ 检查AI配置              │                                     │
│  │ - AI是否启用？          │                                     │
│  │ - 是否配置提供商？      │                                     │
│  │ - 服务是否可用？        │                                     │
│  └───────────┬─────────────┘                                     │
│              │                                                    │
│     ┌────────┴────────┐                                          │
│     ▼                 ▼                                          │
│  [可用]            [不可用]                                       │
│     │                 │                                          │
│     ▼                 ▼                                          │
│  ┌────────────┐  ┌──────────────────────┐                        │
│  │调用AI服务  │  │ 显示引导弹窗           │                        │
│  └─────┬──────┘  │ "AI服务未配置，        │                        │
│        │         │  是否前往配置？"       │                        │
│     ┌──┴──┐      │ ┌──────┐ ┌──────┐    │                        │
│     ▼     ▼      │ │立即配置│ │使用基础功能│                        │
│  [成功]  [失败]   │ └──────┘ └──────┘    │                        │
│     │     │      └──────────────────────┘                        │
│     ▼     └───────┐                    │                        │
│  ┌────────────┐   ▼                    ▼                        │
│  │显示AI结果  │  ┌─────────────────────────────┐                 │
│  └────────────┘  │ 降级方案：                    │                 │
│                  │ • 基础规则生成                │                 │
│                  │ • 显示提示"AI服务暂时不可用"   │                 │
│                  │ • 引导手动创建                │                 │
│                  └─────────────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. 用户引导与教育

### 9.1 新用户首次体验

text

```
┌─────────────────────────────────────────────────────────────────┐
│                    新用户引导流程                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  首次访问 APIForge                                                │
│         │                                                        │
│         ▼                                                        │
│  ┌─────────────────┐                                             │
│  │  注册/登录      │                                             │
│  └────────┬────────┘                                             │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │  创建第一个项目  │                                             │
│  └────────┬────────┘                                             │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────┐                 │
│  │          欢迎引导卡片                         │                 │
│  ├─────────────────────────────────────────────┤                 │
│  │  🎉 欢迎使用 APIForge！                        │                 │
│  │                                              │                 │
│  │  快速开始：                                    │                 │
│  │  [1] 导入 Swagger 文档                        │                 │
│  │  [2] 调试第一个接口                            │                 │
│  │  [3] 创建测试用例                              │                 │
│  │  [4] 执行测试                                 │                 │
│  │  [5] 查看报告                                 │                 │
│  │                                              │                 │
│  │  [开始引导]  [跳过，我自己探索]                 │                 │
│  └─────────────────────────────────────────────┘                 │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ 导入Swagger     │                                             │
│  └────────┬────────┘                                             │
│           ▼                                                      │
│  ┌─────────────────┐                                             │
│  │ API解析完成     │                                             │
│  └────────┬────────┘                                             │
│           ▼                                                      │
│  ┌─────────────────────────────────────────────┐                 │
│  │        下一步引导                            │                 │
│  ├─────────────────────────────────────────────┤                 │
│  │  ✅ 已导入 15 个 API                           │                 │
│  │                                              │                 │
│  │  接下来可以：                                  │                 │
│  │  • 调试API                                    │                 │
│  │  • 创建测试用例                                │                 │
│  │  • 配置环境变量 (可选)                          │                 │
│  │                                              │                 │
│  │  [去调试]  [稍后]                            │                 │
│  └─────────────────────────────────────────────┘                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 AI价值提示

#### 智能提示时机

typescript

```
// 手动创建多个测试用例后
if (manualTestCaseCount >= 5 && !aiConfigured) {
  showAIPrompt({
    type: 'value',
    title: '需要AI帮您自动生成测试用例吗？',
    message: `您已经手动创建了 ${manualTestCaseCount} 个测试用例，` +
             'AI可以帮您自动生成边界测试、异常测试和安全测试，' +
             '节省大量时间。',
    actions: [
      { label: '配置AI', primary: true },
      { label: '稍后提醒', secondary: true },
      { label: '不再提醒' }
    ]
  });
}

// 测试失败率较高时
if (testFailureRate > 0.2 && aiConfigured && !aiErrorAnalysisUsed) {
  showSuggestion({
    type: 'analysis',
    message: '检测到测试失败率较高，需要AI分析失败原因吗？',
    action: {
      label: 'AI分析失败',
      handler: () => triggerErrorAnalysis()
    }
  });
}

// 首次查看报告时
if (isFirstReport && !aiConfigured) {
  showSuggestion({
    type: 'report',
    message: 'AI可以为您生成报告总结，快速了解测试结果的关键信息。',
    action: {
      label: '了解AI报告',
      handler: () => router.push('/settings/ai')
    }
  });
}
```

#### AI价值弹窗示例

text

```
┌─────────────────────────────────────────────────────┐
│  ✨ AI可以为您做什么？                               │
├─────────────────────────────────────────────────────┤
│                                                      │
│  📝 自动生成测试用例                                  │
│     根据API文档自动生成完整测试用例，包括：            │
│     • 正常场景测试                                    │
│     • 边界值测试                                      │
│     • 异常场景测试                                    │
│     • 安全测试（SQL注入、XSS等）                      │
│                                                      │
│  🔍 智能分析失败原因                                  │
│     当测试失败时，AI会分析：                          │
│     • 可能的错误原因                                  │
│     • 修复建议                                        │
│     • 相似问题参考                                    │
│                                                      │
│  📊 报告智能总结                                      │
│     自动生成测试报告摘要：                            │
│     • 关键问题总结                                    │
│     • 风险评级                                        │
│     • 优化建议                                        │
│                                                      │
│  [立即配置AI]  [了解更多]  [暂不配置]                │
└─────────────────────────────────────────────────────┘
```

---

## 10. 项目规划

### 10.1 MVP开发计划

#### 第一阶段：基础框架（4周）

| 周    | 任务                 | 产出                     |
| :---- | :------------------- | :----------------------- |
| 第1周 | 项目初始化、架构搭建 | 基础项目结构、数据库连接 |
| 第2周 | 用户认证、项目管理   | 登录/注册、项目CRUD      |
| 第3周 | Swagger导入、API管理 | 文档解析、API列表展示    |
| 第4周 | 接口调试功能         | 调试页面、请求发送       |

#### 第二阶段：测试核心（4周）

| 周    | 任务         | 产出                   |
| :---- | :----------- | :--------------------- |
| 第5周 | 环境管理     | 环境配置、变量替换     |
| 第6周 | 测试用例管理 | 手动创建用例、断言编辑 |
| 第7周 | 测试执行引擎 | 单接口执行、批量执行   |
| 第8周 | 基础报告     | 报告统计、详情展示     |

#### 第三阶段：场景测试（3周）

| 周     | 任务         | 产出               |
| :----- | :----------- | :----------------- |
| 第9周  | 场景测试设计 | 场景创建、步骤编排 |
| 第10周 | 变量传递机制 | 步骤间变量传递     |
| 第11周 | 定时任务     | Cron任务、执行记录 |

#### 第四阶段：AI集成（3周）

| 周     | 任务         | 产出                   |
| :----- | :----------- | :--------------------- |
| 第12周 | AI提供商配置 | 多提供商支持、健康检查 |
| 第13周 | AI测试生成   | 测试用例生成、断言生成 |
| 第14周 | AI分析功能   | 失败分析、报告总结     |

### 10.2 版本迭代路线图

text

```
v1.0.0 (MVP) - 第14周
├── 项目管理
├── Swagger导入
├── 接口调试
├── 环境管理
├── 手动测试用例
├── 测试执行
└── 基础报告

v1.1.0 - 第16周
├── 场景测试
├── 变量传递
├── 定时任务
└── 报告导出

v1.2.0 - 第18周
├── AI配置管理
├── AI测试生成
├── AI断言生成
└── AI失败分析

v1.3.0 - 第20周
├── 团队协作
├── 权限管理
├── 操作日志
└── Webhook集成

v2.0.0 - 第24周
├── CI/CD集成
├── Mock Server
├── 性能测试
└── 企业版功能
```

---

## 11. 未来扩展

### 11.1 功能扩展规划

| 功能            | 描述                                   | 优先级 |
| :-------------- | :------------------------------------- | :----- |
| **CI/CD集成**   | 集成GitHub Actions、GitLab CI、Jenkins | ⭐⭐⭐ |
| **Mock Server** | 根据Swagger自动生成Mock API            | ⭐⭐⭐ |
| **性能测试**    | 压力测试、负载测试                     | ⭐⭐   |
| **Fuzz测试**    | 自动生成随机输入测试                   | ⭐⭐   |
| **API监控**     | 定时监控API可用性                      | ⭐⭐⭐ |
| **团队协作**    | 多角色权限、评论、审核                 | ⭐⭐⭐ |
| **插件系统**    | 支持自定义插件                         | ⭐⭐   |
| **导出导入**    | 测试数据导入导出                       | ⭐⭐   |
| **对比测试**    | 多版本API对比                          | ⭐     |
| **流量录制**    | 录制生产流量生成测试                   | ⭐⭐⭐ |

---

## 12. 总结

### 12.1 核心价值主张

| 用户类型       | 无AI的基础价值              | 有AI的增值价值             |
| :------------- | :-------------------------- | :------------------------- |
| **中小团队**   | 免费、开源的API测试管理平台 | 减少手工编写测试用例的时间 |
| **大型企业**   | 完整的数据主权，可离线部署  | 智能分析海量测试结果       |
| **个人开发者** | 轻量级Postman替代品         | 快速生成测试数据           |
| **测试团队**   | 标准化测试流程管理          | AI辅助测试设计             |
| **DevOps团队** | CI/CD集成能力               | 智能质量分析               |

### 12.2 设计要点回顾

1. **AI完全可选**：用户可以不配置任何AI服务，使用全部核心功能
2. **渐进式增强**：AI在基础功能之上提供智能化体验
3. **优雅降级**：AI服务不可用时，系统无缝切换到基础模式
4. **用户控制**：用户可以精细控制每个AI功能的开关
5. **价值引导**：在合适的时机展示AI价值，但不强制
6. **数据主权**：用户数据完全自主可控
7. **开放集成**：支持多种AI提供商，避免厂商锁定

### 12.3 最终系统能力

text

```
┌─────────────────────────────────────────────────────────────┐
│                     APIForge 能力全景图                      │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  文档解析层                                                  │
│  ├── Swagger 2.0/3.0 ✓                                      │
│  ├── OpenAPI 3.x ✓                                          │
│  ├── Postman Collection ✓                                   │
│  └── HAR文件 ✓                                              │
│                                                              │
│  测试管理层                                                  │
│  ├── 项目管理 ✓                                             │
│  ├── 环境管理 ✓                                             │
│  ├── 测试用例 ✓                                             │
│  ├── 测试场景 ✓                                             │
│  └── 定时任务 ✓                                             │
│                                                              │
│  执行引擎层                                                  │
│  ├── 单接口执行 ✓                                           │
│  ├── 批量执行 ✓                                             │
│  ├── 场景执行 ✓                                             │
│  ├── 并发控制 ✓                                             │
│  └── 变量替换 ✓                                             │
│                                                              │
│  报告分析层                                                  │
│  ├── 统计报表 ✓                                             │
│  ├── 性能分析 ✓                                             │
│  ├── 趋势图表 ✓                                             │
│  └── 报告导出 ✓                                             │
│                                                              │
│  AI增强层 (可选)                                             │
│  ├── 语义解析 ✨                                            │
│  ├── 测试生成 ✨                                            │
│  ├── 断言生成 ✨                                            │
│  ├── 失败分析 ✨                                            │
│  └── 报告总结 ✨                                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```
