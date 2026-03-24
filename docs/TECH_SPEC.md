# TECH_SPEC — 超级员工助手 (The Cognitive Editorial)

**版本**: v1.0  
**对应 PRD**: PRD_SuperEmployee_v3  
**状态**: 草稿

---

## 目录

1. [系统概述](#1-系统概述)
2. [技术栈选型](#2-技术栈选型)
3. [整体架构](#3-整体架构)
4. [模块一：前端应用](#4-模块一前端应用)
5. [模块二：API 网关 / BFF](#5-模块二api-网关--bff)
6. [模块三：认证与权限服务](#6-模块三认证与权限服务)
7. [模块四：AI 对话服务](#7-模块四ai-对话服务)
8. [模块五：业务服务](#8-模块五业务服务)
9. [模块六：知识库服务](#9-模块六知识库服务)
10. [模块七：数据层](#10-模块七数据层)
11. [非功能性要求](#11-非功能性要求)
12. [部署架构](#12-部署架构)
13. [开发阶段划分](#13-开发阶段划分)

---

## 1. 系统概述

### 1.1 背景

超级员工助手是一款面向企业内部的 AI 智能办公 Web 应用，通过自然语言交互帮助员工完成报销、请假、会议室预定、IT 报修、通讯录查询等高频事务。

### 1.2 系统边界

```
用户浏览器
    │  HTTPS
    ▼
API 网关 / BFF          ← 统一入口、鉴权、路由、限流
    ├── AI 对话服务      ← LLM 调用、Intent 识别、Skill 路由
    ├── 业务服务         ← 报销 / 请假 / 会议 / IT 工单 / 通讯录
    └── 知识库服务       ← 文件解析、Embedding、向量检索
         │
    数据层
    ├── PostgreSQL       ← 用户、会话、审批记录、审计日志
    ├── Redis            ← JWT 黑名单、热点缓存
    ├── 对象存储 (S3)    ← 原始文件、发票附件
    └── 向量数据库       ← 文档 Embedding 索引
```

### 1.3 核心设计原则

- **权限双层校验**：展示层（前端字段隐藏）与服务层（后端接口字段裁剪）同时执行，互为补充，任一层单独缺失均视为安全缺陷。
- **写操作幂等**：所有创建/提交类接口必须支持幂等，防止确认机制下的重复提交。
- **AI 不直接执行写操作**：AI 只负责识别意图并渲染卡片，写操作必须经由用户显式确认后才触发后端接口。
- **异步优先**：文件解析、Embedding 生成等耗时操作全部走异步队列，不阻塞主请求。

---

## 2. 技术栈选型

### 2.1 前端

| 类别 | 选型 | 说明 |
|------|------|------|
| 框架 | React 18 + TypeScript | 组件化、类型安全 |
| 构建 | Vite | 开发体验好，构建快 |
| 状态管理 | Zustand | 轻量，适合对话流状态 |
| UI 组件 | Shadcn/ui + Tailwind CSS | 可定制，设计系统友好 |
| 流式渲染 | 原生 `EventSource` (SSE) | 接收 AI 逐 token 输出 |
| HTTP | Axios + React Query | 请求管理、缓存、重试 |
| 路由 | React Router v6 | SPA 路由 |

### 2.2 后端

| 类别 | 选型 | 说明 |
|------|------|------|
| 运行时 | Node.js 20 (LTS) | 团队统一，IO 密集型友好 |
| 框架 | Fastify | 性能优于 Express，Schema 校验内置 |
| API 风格 | RESTful + SSE（AI 流式） | 简单明确，SSE 用于 AI 输出 |
| 鉴权 | JWT (jsonwebtoken) + bcrypt | 无状态，Refresh Token 机制 |
| ORM | Prisma | 类型安全，迁移管理方便 |
| 任务队列 | BullMQ (Redis-backed) | 文件解析异步任务 |
| 日志 | Pino | 结构化 JSON 日志，性能高 |

### 2.3 AI / ML

| 类别 | 选型 | 说明 |
|------|------|------|
| LLM | OpenAI GPT-4o / Azure OpenAI | Function Calling 支持完善；可替换为国内厂商 |
| Embedding | text-embedding-3-small | 性价比高，1536 维 |
| 向量数据库 | pgvector (PostgreSQL 扩展) | MVP 阶段复用 PG，减少依赖；数据量大后迁移 Qdrant |
| RAG 框架 | 自行实现（不引入 LangChain） | 依赖链路短，便于调试和控制 |

### 2.4 基础设施

| 类别 | 选型 |
|------|------|
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 对象存储 | AWS S3 / 阿里云 OSS（S3 兼容接口） |
| 容器化 | Docker + Docker Compose（开发）/ Kubernetes（生产） |
| CI/CD | GitHub Actions |
| 监控 | Prometheus + Grafana |

---

## 3. 整体架构

### 3.1 请求流转（普通对话）

```
用户输入
  │
  ▼
前端 → POST /api/chat/message
  │
  ▼
API 网关（JWT 校验 → 角色注入）
  │
  ▼
AI 对话服务
  ├── 1. 拼装 Prompt（系统提示 + 用户角色 + 知识库检索结果 + 历史消息）
  ├── 2. 调用 LLM（Function Calling 模式）
  ├── 3. 解析响应：纯文本 or Skill 函数调用
  ├── 4a. 纯文本 → SSE 流式推送至前端
  └── 4b. Skill 调用 → 返回结构化卡片数据 → 前端渲染对应 Skill 卡片
```

### 3.2 请求流转（写操作 Skill）

```
用户填写卡片 → 点击「确认提交」
  │
  ▼
前端附加幂等 Token → POST /api/skills/{skill}/submit
  │
  ▼
API 网关（JWT 校验）
  │
  ▼
业务服务
  ├── 幂等检查（Redis 查幂等 Token，已存在则返回原结果）
  ├── 参数校验
  ├── 执行业务逻辑（写 DB）
  └── 返回结果（成功 / 失败 + 原因）
  │
  ▼
前端卡片切换为「已提交」只读态 or 显示错误+重试
```

### 3.3 知识库文件处理流

```
用户上传文件
  │
  ▼
前端 → POST /api/knowledge/upload（Multipart）
  │
  ▼
知识库服务
  ├── 文件类型校验（Magic Bytes + MIME）
  ├── 存储至对象存储（S3）
  ├── 写 DB 记录（状态: processing）
  └── 推送任务至 BullMQ 队列
        │
        ▼（异步 Worker）
        ├── 文本提取（PDF→pdfjs / Word→mammoth / 扫描件→OCR）
        ├── 分块（Chunking，512 token，128 overlap）
        ├── 调用 Embedding API 生成向量
        ├── 写入 pgvector
        └── 更新 DB 记录（状态: ready / failed + 原因）
              │
              ▼（WebSocket 或轮询）
            前端更新文档列表状态
```

---

## 4. 模块一：前端应用

### 4.1 目录结构

```
src/
├── app/                    # 路由、全局 Provider
├── components/
│   ├── ui/                 # 基础组件（Button、Input、Chip 等）
│   ├── chat/               # 对话相关组件
│   │   ├── MessageFeed.tsx
│   │   ├── MessageBubble.tsx
│   │   ├── InputArea.tsx
│   │   └── ContextChipBar.tsx
│   ├── skills/             # Skill 卡片组件
│   │   ├── SkillCard.tsx          # 卡片基础容器（含确认栏）
│   │   ├── ExpenseCard.tsx
│   │   ├── MeetingCard.tsx
│   │   ├── LeaveCard.tsx
│   │   ├── ScheduleCard.tsx
│   │   ├── ITCard.tsx
│   │   ├── ContactCard.tsx
│   │   └── DocQACard.tsx
│   ├── knowledge/          # 知识库模块组件
│   └── layout/             # Sidebar、HistoryDrawer 等
├── stores/                 # Zustand stores
│   ├── chatStore.ts        # 当前会话消息、上下文池
│   ├── authStore.ts        # 用户信息、角色、Token
│   └── knowledgeStore.ts   # 文档列表
├── hooks/                  # 自定义 hooks
│   ├── useSSE.ts           # SSE 流式接收
│   ├── useIdempotentMutation.ts  # 幂等提交 hook
│   └── usePermission.ts    # 展示层权限判断
├── api/                    # API 请求封装
├── types/                  # 类型定义
└── utils/
```

### 4.2 对话引擎

**消息状态机**

每条用户消息拥有独立状态：

```typescript
type MessageStatus = 'sending' | 'delivered' | 'failed';

interface UserMessage {
  id: string;
  content: string;
  status: MessageStatus;
  attachments?: Attachment[];
  contextDocIds?: string[];   // 本条消息关联的知识库文档 ID
}
```

- `sending`：请求已发出，等待服务端确认
- `delivered`：服务端已接收（HTTP 200）
- `failed`：网络超时或服务端报错，显示重试入口

**SSE 流式渲染**

```typescript
// useSSE.ts
function useSSE(url: string) {
  // 建立 SSE 连接
  // 监听 message 事件，逐 token append 到 AI 消息内容
  // 监听 skill 事件，接收结构化卡片数据，挂载对应 Skill 卡片组件
  // 监听 done 事件，标记消息完成
  // 监听 error 事件，展示错误状态
}
```

**流式事件协议**（SSE event types）

| event | data 格式 | 说明 |
|-------|-----------|------|
| `text` | `{ delta: string }` | AI 文本 token 增量 |
| `skill` | `{ skillType: string, payload: object }` | Skill 卡片数据 |
| `done` | `{ messageId: string }` | 本轮回复结束 |
| `error` | `{ code: string, message: string }` | 错误信息 |

### 4.3 Skill 卡片系统

**卡片基础状态**

```typescript
type SkillCardState =
  | 'filling'      // 可编辑填写状态
  | 'confirming'   // 展示确认栏（写操作卡片独有）
  | 'submitting'   // 提交中，加载态
  | 'submitted'    // 已提交，只读态
  | 'failed'       // 提交失败，显示错误+重试
  | 'readonly';    // 只读查询类卡片（schedule、contact 等）
```

**SkillCard 基础容器**（所有 Skill 卡片复用）

```typescript
// SkillCard.tsx
interface SkillCardProps {
  skillType: string;
  state: SkillCardState;
  onConfirm: () => Promise<void>;   // 确认提交回调
  onCancel: () => void;
  children: React.ReactNode;        // 具体卡片内容
  confirmSummary?: React.ReactNode; // 确认栏展示的摘要内容
}
```

确认栏仅在 `confirming` 状态下渲染，包含主操作「确认提交」和次操作「取消」，取消后回到 `filling` 状态且已填内容保留。

**幂等提交 Hook**

```typescript
// useIdempotentMutation.ts
function useIdempotentMutation(endpoint: string) {
  const idempotencyKey = useRef(generateUUID()); // 每次卡片挂载生成一次，不重新生成

  const submit = async (payload: object) => {
    return axios.post(endpoint, payload, {
      headers: { 'Idempotency-Key': idempotencyKey.current }
    });
  };

  return { submit };
}
```

### 4.4 展示层权限过滤

```typescript
// usePermission.ts
type Role = 'employee' | 'hr' | 'management';

const FIELD_VISIBILITY: Record<string, Role[]> = {
  'contact.phone':   ['hr', 'management'],
  'contact.email':   ['hr', 'management'],
  'contact.salary':  ['hr'],
  'approval.all':    ['hr', 'management'],
};

function usePermission() {
  const role = useAuthStore(s => s.role);
  const canSee = (field: string) =>
    FIELD_VISIBILITY[field]?.includes(role) ?? true;
  return { canSee };
}
```

> **重要**：`canSee` 仅控制前端展示，后端接口不依赖此判断。即使前端被绕过，后端返回数据中对应字段已被裁剪为 `null` 或不存在。

### 4.5 上下文池（Context Chip Bar）

```typescript
interface ContextDoc {
  id: string;
  name: string;
  bypassed: boolean;  // true = 此文档被排除出本次对话上下文
}
```

- Bypass 状态的 Chip 显示为灰色删除线样式，与激活状态有明确视觉区分
- AI 请求时仅将 `bypassed: false` 的文档 ID 传给后端
- 消息气泡内嵌的文档标签仅展示本条消息发送时实际参与的文档

---

## 5. 模块二：API 网关 / BFF

### 5.1 职责边界

API 网关作为系统唯一对外入口，负责：

1. TLS 终止（HTTPS）
2. JWT 校验与用户身份注入（所有下游服务从请求上下文读取，不重复鉴权）
3. **服务层权限字段裁剪**（敏感接口在网关层统一处理）
4. 请求路由至各下游服务
5. 限流（基于 userId，防止滥用 AI 接口）
6. 请求日志（含 traceId 生成）

### 5.2 路由规则

| 路径前缀 | 目标服务 | 备注 |
|----------|----------|------|
| `POST /api/auth/*` | 认证服务 | 不需要 JWT |
| `GET/POST /api/chat/*` | AI 对话服务 | 需要 JWT |
| `POST /api/skills/*` | 业务服务 | 需要 JWT + 幂等校验 |
| `GET /api/skills/*` | 业务服务 | 需要 JWT |
| `GET/POST /api/knowledge/*` | 知识库服务 | 需要 JWT |
| `GET /api/users/me` | 认证服务 | 需要 JWT |

### 5.3 JWT 结构

```json
{
  "sub": "user_abc123",
  "role": "employee",        // "employee" | "hr" | "management"
  "name": "张三",
  "exp": 1700000000,
  "iat": 1699996400,
  "jti": "unique-token-id"   // 用于黑名单
}
```

**Token 有效期**：Access Token 2 小时，Refresh Token 7 天。

### 5.4 服务层权限字段裁剪

网关维护一张字段权限表，在响应返回前对指定接口的响应体做字段过滤：

```typescript
const RESPONSE_FIELD_POLICY: Record<string, {
  path: string;           // 响应体中的字段路径
  allowedRoles: Role[];
}[]> = {
  'GET /api/skills/contact/:id': [
    { path: 'data.phone',  allowedRoles: ['hr', 'management'] },
    { path: 'data.email',  allowedRoles: ['hr', 'management'] },
    { path: 'data.salary', allowedRoles: ['hr'] },
  ],
  'GET /api/approvals': [
    { path: 'data[*].submitterId', allowedRoles: ['hr', 'management'] },
  ],
};
```

过滤逻辑：遍历 policy，若当前用户 role 不在 `allowedRoles` 中，则将对应字段设为 `null`，不移除字段（前端需要知道字段存在但无权查看）。

### 5.5 限流策略

| 接口类型 | 限流规则 |
|----------|----------|
| AI 对话接口 | 每用户每分钟 20 次 |
| 写操作 Skill 接口 | 每用户每分钟 10 次 |
| 文件上传接口 | 每用户每小时 50 次 |
| 其他接口 | 每用户每分钟 100 次 |

超出限制返回 `429 Too Many Requests`，响应头携带 `Retry-After`。

---

## 6. 模块三：认证与权限服务

### 6.1 登录流程

```
POST /api/auth/login
  Body: { username, password }
  
  1. 查询 users 表，取 passwordHash
  2. bcrypt.compare(password, passwordHash)
  3. 生成 Access Token（JWT，2h）
  4. 生成 Refresh Token（随机字符串，存 Redis，TTL 7d）
  5. 返回 { accessToken, refreshToken, user: { id, name, role } }
```

**密码策略**：密码存储使用 bcrypt，cost factor 12。

**登录失败处理**：

```
连续失败次数 → 动作
1-4 次       → 返回「用户名或密码错误」（不区分哪个错）
5 次         → 账号锁定 30 分钟，返回锁定提示及解锁时间
解锁方式     → 等待超时自动解锁（MVP）/ 联系 IT（后续扩展）
```

失败次数存 Redis，key = `login_fail:{username}`，TTL 30 分钟，锁定后写 `login_locked:{username}`。

### 6.2 Token 刷新

```
POST /api/auth/refresh
  Body: { refreshToken }
  
  1. 查询 Redis：refreshToken → userId
  2. 若不存在或已过期 → 401，要求重新登录
  3. 签发新 Access Token
  4. 滚动刷新：删旧 Refresh Token，签发新 Refresh Token，写 Redis
  5. 返回 { accessToken, refreshToken }
```

### 6.3 登出

```
POST /api/auth/logout
  Header: Authorization: Bearer <accessToken>
  Body: { refreshToken }
  
  1. 将 accessToken 的 jti 写入 Redis 黑名单，TTL = token 剩余有效期
  2. 删除 Redis 中的 refreshToken
  3. 返回 200
```

网关每次校验 JWT 后，额外查询黑名单（`jti`），命中则返回 `401`。

### 6.4 数据库 Schema（认证相关）

```sql
-- 用户表
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      VARCHAR(64) UNIQUE NOT NULL,
  password_hash VARCHAR(256) NOT NULL,
  name          VARCHAR(64) NOT NULL,
  avatar_url    VARCHAR(512),
  role          VARCHAR(32) NOT NULL DEFAULT 'employee',
                -- 'employee' | 'hr' | 'management'
  department    VARCHAR(64),
  position      VARCHAR(64),
  phone         VARCHAR(32),
  email         VARCHAR(128),
  work_location VARCHAR(64),
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_users_role ON users(role);
```

---

## 7. 模块四：AI 对话服务

### 7.1 职责

- 接收前端对话请求，组装 Prompt，调用 LLM
- 通过 Function Calling 识别用户意图，路由至对应 Skill
- 流式推送 AI 文本回复或结构化 Skill 卡片数据
- 管理会话上下文（历史消息 + 知识库检索结果）
- 持久化每轮对话记录

### 7.2 接口定义

**发送消息**

```
POST /api/chat/message
Content-Type: application/json
Accept: text/event-stream

Body:
{
  "sessionId": "sess_abc",          // 可选，无则创建新会话
  "content": "帮我请明天的年假",
  "attachments": [],                // 上传的图片/文件（Base64 或对象存储 URL）
  "contextDocIds": ["doc_1", "doc_2"]  // 本轮激活的知识库文档（非 Bypass）
}

Response: SSE stream
event: text
data: {"delta": "好的，"}

event: text
data: {"delta": "我帮您"}

event: skill
data: {"skillType": "leave", "payload": {...}}

event: done
data: {"messageId": "msg_xyz", "sessionId": "sess_abc"}
```

**获取历史会话列表**

```
GET /api/chat/sessions
Response:
{
  "data": [
    { "id": "sess_abc", "title": "请假申请", "updatedAt": "2025-01-01T10:00:00Z" }
  ]
}
```

**获取指定会话消息**

```
GET /api/chat/sessions/:sessionId/messages
Response:
{
  "data": [
    {
      "id": "msg_1",
      "role": "user",
      "content": "帮我请明天的年假",
      "contextDocIds": ["doc_1"],
      "createdAt": "..."
    },
    {
      "id": "msg_2",
      "role": "assistant",
      "content": "",
      "skillCards": [{ "skillType": "leave", "payload": {...}, "state": "submitted" }],
      "createdAt": "..."
    }
  ]
}
```

### 7.3 Prompt 设计

**System Prompt 模板**

```
你是「超级员工助手」，企业内部 AI 办公助理。

当前用户信息：
- 姓名：{userName}
- 角色：{role}（employee / hr / management）
- 部门：{department}
- 当前时间：{datetime}

你的能力：
1. 帮助用户完成企业办公事务（报销、请假、会议室预定、IT 报修、通讯录查询）
2. 基于用户提供的文档回答问题
3. 回答企业制度相关问题

重要规则：
- 涉及规章制度的回答末尾，必须附加：「以上信息仅供参考，请以企业实际政策为准」
- 你只能识别意图并展示操作卡片，不能直接执行写操作，写操作需用户确认后才生效
- 不要捏造数据，不确定时请如实说明

{knowledgeContext}  ← 知识库检索结果注入位置
```

**知识库上下文注入**

当请求携带 `contextDocIds` 时，在发送 LLM 前先执行向量检索：

```
1. 将用户消息向量化
2. 在 pgvector 中检索 contextDocIds 范围内的 Top-K chunks（K=5，相似度阈值 0.75）
3. 将检索结果格式化为：
   [参考文档片段]
   文件名：xxx.pdf，第 2 段
   内容：...
   ---
4. 注入 System Prompt 的 {knowledgeContext} 位置
```

### 7.4 Intent 识别与 Skill 路由

使用 OpenAI Function Calling（Tool Use）模式定义 7 个 Skill 的触发函数：

```typescript
const SKILL_TOOLS = [
  {
    type: "function",
    function: {
      name: "trigger_expense",
      description: "当用户想要提交报销、查询报销进度、查看报销审批状态时调用",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "query"] },
          prefill: {
            type: "object",
            properties: {
              reason: { type: "string" },
              amount: { type: "number" },
              date: { type: "string" }
            }
          }
        }
      }
    }
  },
  // trigger_meeting, trigger_leave, trigger_schedule,
  // trigger_it, trigger_contact, trigger_doc_qa ...
];
```

**多 Skill 命中处理**：

LLM 单次响应可能调用多个 tool，按以下顺序依次处理并推送 `skill` 事件：

1. `leave`（请假）
2. `meeting`（会议）
3. `expense`（报销）
4. `it`（IT 工单）
5. `contact`（通讯录）
6. `schedule`（日程）
7. `doc_qa`（文档问答）

### 7.5 Context Window 管理

```
最大 Context = 模型上限（如 128K token）× 0.8（保留 20% 给输出）

组装顺序（优先级从高到低）：
1. System Prompt（固定，约 500 token）
2. 知识库检索结果（最多 4000 token）
3. 历史消息（从最新往旧填充，直到触及上限）

触发截断时：
- 丢弃最旧的历史消息
- 前端收到 warning 事件，提示：「早期对话内容已超出上下文范围」
- 知识库文档 Chip 仍然显示，但提示用户实际可参考的内容有限
```

### 7.6 数据库 Schema（会话相关）

```sql
-- 会话表
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  title       VARCHAR(256),          -- 第一条消息截取前 20 字
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions(user_id, updated_at DESC);

-- 消息表
CREATE TABLE messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role            VARCHAR(16) NOT NULL,   -- 'user' | 'assistant'
  content         TEXT,
  context_doc_ids UUID[],                 -- 本条消息关联的知识库文档
  skill_cards     JSONB,                  -- Skill 卡片快照（含最终状态）
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_session ON messages(session_id, created_at ASC);
```

---

## 8. 模块五：业务服务

### 8.1 通用设计规范

**幂等实现**

所有写操作接口要求客户端在 Header 携带 `Idempotency-Key`（UUID，前端卡片挂载时生成，整个卡片生命周期不变）：

```
服务端处理流程：
1. 查询 Redis：key = idempotency:{endpoint}:{idempotencyKey}
2. 命中 → 直接返回缓存的原始响应（不重新执行业务逻辑）
3. 未命中 → 执行业务逻辑 → 将响应存入 Redis，TTL 24 小时
```

**统一 Skill 卡片响应格式**

```typescript
interface SkillResponse<T> {
  skillType: string;
  action: 'create' | 'query' | 'update';
  data: T;              // 各 Skill 自定义数据结构
  state: string;        // 卡片渲染初始状态
}
```

**审批状态流转**

```
草稿(draft) → 审批中(pending) → 已通过(approved)
                              → 已驳回(rejected)  [驳回原因必填]
            → 已撤回(withdrawn)  [用户主动撤回，仅 pending 状态可撤回]
```

### 8.2 报销服务（`expense`）

**接口列表**

```
POST   /api/skills/expense/create    创建报销单（写操作，需幂等 Key）
GET    /api/skills/expense/list      查询当前用户的报销单列表
GET    /api/skills/expense/:id       查询单条报销单详情（含驳回原因）
POST   /api/skills/expense/:id/withdraw  撤回（仅 pending 状态）
POST   /api/skills/expense/reapply   基于原单 ID 创建新申请（预填数据）
POST   /api/skills/expense/upload-invoice  上传发票（返回对象存储 URL）
```

**数据库 Schema**

```sql
CREATE TABLE expense_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES users(id),
  reason          VARCHAR(256) NOT NULL,
  amount          NUMERIC(10, 2) NOT NULL,
  date            DATE NOT NULL,
  department      VARCHAR(64),
  invoice_urls    TEXT[],
  status          VARCHAR(32) NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(512),   -- 驳回原因，驳回时必填
  approver_id     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  original_id     UUID REFERENCES expense_records(id),  -- 重新申请时指向原单
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expense_user_status ON expense_records(user_id, status, created_at DESC);
```

### 8.3 请假服务（`leave`）

**接口列表**

```
GET    /api/skills/leave/balance         查询当前用户假期余额
POST   /api/skills/leave/create          创建请假申请（写操作，需幂等 Key）
GET    /api/skills/leave/list            查询申请列表
GET    /api/skills/leave/:id             查询单条详情
POST   /api/skills/leave/:id/withdraw    撤回
POST   /api/skills/leave/reapply         基于原申请重新发起
```

**余额并发控制**

```
创建请假申请时：
1. BEGIN TRANSACTION
2. SELECT balance FROM leave_balances WHERE user_id=? AND type=? FOR UPDATE
3. 检查 balance >= requested_days，否则返回错误
4. 写入 leave_records（status=pending）
5. UPDATE leave_balances SET balance = balance - requested_days（预占）
6. COMMIT

审批通过时：预占已扣，无需再扣
审批驳回/撤回时：返还预占的天数（balance += requested_days）
```

**数据库 Schema**

```sql
CREATE TABLE leave_balances (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id),
  type      VARCHAR(32) NOT NULL,   -- 'annual' | 'sick' | 'personal' 等
  balance   NUMERIC(4,1) NOT NULL,
  year      INT NOT NULL,
  UNIQUE(user_id, type, year)
);

CREATE TABLE leave_records (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES users(id),
  leave_type       VARCHAR(32) NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  days             NUMERIC(4,1) NOT NULL,
  reason           VARCHAR(256),
  status           VARCHAR(32) NOT NULL DEFAULT 'pending',
  rejection_reason VARCHAR(512),
  approver_id      UUID REFERENCES users(id),
  original_id      UUID REFERENCES leave_records(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 8.4 会议室预定服务（`meeting`）

**接口列表**

```
GET    /api/skills/meeting/rooms          查询可用会议室列表（带时间段过滤）
POST   /api/skills/meeting/book           预定（写操作，需幂等 Key）
GET    /api/skills/meeting/bookings       查询当前用户预定记录
DELETE /api/skills/meeting/bookings/:id   取消预定
```

**冲突检测（数据库层）**

```sql
-- 预定时加排他锁，防止并发双预
SELECT id FROM meeting_bookings
WHERE room_id = $1
  AND status = 'confirmed'
  AND tsrange(start_time, end_time) && tsrange($2, $3)
FOR UPDATE;

-- 无冲突则插入
INSERT INTO meeting_bookings (...) VALUES (...);
```

**数据库 Schema**

```sql
CREATE TABLE meeting_rooms (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name     VARCHAR(64) NOT NULL,
  capacity INT NOT NULL,
  location VARCHAR(128),
  amenities TEXT[]   -- ['projector', 'whiteboard', 'tv']
);

CREATE TABLE meeting_bookings (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id      UUID NOT NULL REFERENCES meeting_rooms(id),
  organizer_id UUID NOT NULL REFERENCES users(id),
  title        VARCHAR(128),
  start_time   TIMESTAMPTZ NOT NULL,
  end_time     TIMESTAMPTZ NOT NULL,
  attendee_ids UUID[],
  status       VARCHAR(32) NOT NULL DEFAULT 'confirmed',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_room_time ON meeting_bookings(room_id, start_time, end_time)
  WHERE status = 'confirmed';
```

### 8.5 IT 工单服务（`it`）

**接口列表**

```
GET    /api/skills/it/suggestions/:keyword   根据关键词返回自助排障文档列表
POST   /api/skills/it/tickets/create         创建工单（写操作，需幂等 Key）
GET    /api/skills/it/tickets                查询当前用户工单列表
GET    /api/skills/it/tickets/:id            查询单条工单详情
POST   /api/skills/it/tickets/:id/escalate   转人工
```

**关键词匹配自助文档逻辑**

```
keywords（如"VPN"、"报修"）→ 
全文检索 knowledge_base 中 is_public=true 的文档 → 
返回 Top 3 相关文档摘要，随卡片一并展示
```

### 8.6 通讯录服务（`contact`）

**接口列表**

```
GET /api/skills/contact/search?name=张三    按姓名搜索（模糊匹配）
GET /api/skills/contact/:userId             获取指定用户详情
```

**字段权限裁剪**（后端实现，网关层统一执行）

```typescript
function applyContactPolicy(user: UserRecord, requesterRole: Role): ContactCard {
  return {
    name:         user.name,         // 所有角色可见
    department:   user.department,   // 所有角色可见
    position:     user.position,     // 所有角色可见
    workLocation: user.workLocation, // 所有角色可见
    phone:        ['hr','management'].includes(requesterRole) ? user.phone  : '****',
    email:        ['hr','management'].includes(requesterRole) ? user.email  : null,
    salary:       requesterRole === 'hr'                      ? user.salary : null,
  };
}
```

**审计日志**：每次通讯录查询，写入 `audit_logs` 表：

```sql
INSERT INTO audit_logs (actor_id, action, target_id, metadata, created_at)
VALUES ($userId, 'contact.view', $targetUserId, '{"requesterRole": "employee"}', now());
```

### 8.7 审批进度查询

```
GET /api/approvals?type=expense&status=pending
GET /api/approvals/:type/:id
```

权限规则：
- `employee`：只能查询 `user_id = 自己` 的记录
- `hr` / `management`：可查询所有记录（网关层已通过 role 注入，业务层按 role 决定 WHERE 条件）

驳回原因接口：

```
rejection_reason 字段随审批记录一并返回，后端校验非空（驳回时 rejection_reason 不得为空字符串）
```

重新申请接口：

```
POST /api/approvals/reapply
Body: { originalId: "record_id", type: "expense" | "leave" }

→ 查询原记录，返回预填数据结构
→ 不创建新记录（新记录在用户确认提交后由对应 Skill 创建接口处理）
```

---

## 9. 模块六：知识库服务

### 9.1 职责

- 接收用户上传的私有文档，存储至对象存储
- 异步解析文档内容（文本提取 / OCR）
- 对文本分块并生成 Embedding，写入向量数据库
- 提供向量检索接口，供 AI 对话服务做 RAG
- 管理文档生命周期（上传、解析、查询、删除）

### 9.2 支持的文件格式（MVP）

| 格式 | 解析方案 | 备注 |
|------|----------|------|
| PDF（文本型） | `pdfjs-dist` 提取文本 | 主流格式，优先支持 |
| PDF（扫描件） | Tesseract.js OCR | 质量受扫描精度影响 |
| Word (.docx) | `mammoth` | 提取纯文本，忽略样式 |
| 纯文本 (.txt) | 直接读取 | — |

不在上述白名单内的格式，上传时返回明确错误：`{"code": "UNSUPPORTED_FORMAT", "message": "当前支持 PDF、Word、TXT 格式"}`。

### 9.3 接口定义

```
POST   /api/knowledge/upload            上传文件（Multipart）
GET    /api/knowledge/documents         获取当前用户文档列表
GET    /api/knowledge/documents/:id     获取单个文档详情（含解析状态）
DELETE /api/knowledge/documents/:id     删除文档（级联清理向量和对象存储）
GET    /api/knowledge/documents/:id/preview  获取预览（Pre-signed URL）
```

**上传接口响应**

```json
{
  "id": "doc_abc",
  "name": "员工手册.pdf",
  "size": 1048576,
  "status": "processing",
  "uploadedAt": "2025-01-01T10:00:00Z"
}
```

**文档状态枚举**

| status | 含义 |
|--------|------|
| `uploading` | 文件正在上传至对象存储 |
| `processing` | 已入队，等待解析 |
| `ready` | 解析完成，可用于 RAG |
| `failed` | 解析失败，附带 `failReason` |

### 9.4 文件处理 Worker

Worker 从 BullMQ 队列消费任务，每个文档一个任务：

```typescript
// knowledge.worker.ts
async function processDocument(job: Job<{ docId: string }>) {
  const doc = await db.knowledge_documents.findById(job.data.docId);

  // 1. 从对象存储下载文件
  const fileBuffer = await s3.getObject(doc.s3Key);

  // 2. 根据 mimeType 选择解析器
  let text: string;
  if (doc.mimeType === 'application/pdf') {
    text = await extractPdfText(fileBuffer);   // pdfjs or Tesseract
  } else if (doc.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    text = await extractDocxText(fileBuffer);  // mammoth
  } else {
    text = fileBuffer.toString('utf-8');
  }

  // 3. 分块（512 token，128 token overlap）
  const chunks = splitIntoChunks(text, { chunkSize: 512, overlap: 128 });

  // 4. 批量生成 Embedding（OpenAI text-embedding-3-small）
  const embeddings = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks.map(c => c.content),
  });

  // 5. 写入 pgvector
  await db.$executeRaw`
    INSERT INTO document_chunks (id, doc_id, content, chunk_index, embedding)
    SELECT gen_random_uuid(), ${doc.id}, chunk.content, chunk.idx,
           chunk.embedding::vector
    FROM jsonb_array_elements($1) AS chunk
  `;

  // 6. 更新文档状态
  await db.knowledge_documents.update({ id: doc.id }, { status: 'ready' });

  // 7. 通知前端（通过轮询接口 or WebSocket）
}
```

**错误处理**：Worker 捕获所有异常，将文档状态更新为 `failed`，写入 `fail_reason`（如：`"OCR 识别失败：文件可能为加密 PDF"`），BullMQ 配置最大重试 2 次。

### 9.5 向量检索接口

供 AI 对话服务内部调用（不对外暴露）：

```
POST /internal/knowledge/search
Body:
{
  "query": "年假申请流程",
  "docIds": ["doc_1", "doc_2"],  // 仅检索这些文档
  "topK": 5,
  "minScore": 0.75
}

Response:
{
  "chunks": [
    {
      "docId": "doc_1",
      "docName": "员工手册.pdf",
      "chunkIndex": 3,
      "content": "...",
      "score": 0.92
    }
  ]
}
```

**pgvector 检索 SQL**

```sql
SELECT
  dc.id,
  dc.doc_id,
  dc.content,
  dc.chunk_index,
  kd.name AS doc_name,
  1 - (dc.embedding <=> $queryEmbedding::vector) AS score
FROM document_chunks dc
JOIN knowledge_documents kd ON kd.id = dc.doc_id
WHERE dc.doc_id = ANY($docIds)
  AND 1 - (dc.embedding <=> $queryEmbedding::vector) >= $minScore
ORDER BY dc.embedding <=> $queryEmbedding::vector
LIMIT $topK;
```

### 9.6 文档删除级联处理

```
DELETE /api/knowledge/documents/:id

1. 从 pgvector 删除对应 document_chunks（WHERE doc_id = ?）
2. 从对象存储删除原始文件
3. 将 knowledge_documents 记录标记为 deleted（软删除，保留 meta 信息）
4. 历史对话中引用该文档的 Chip 标签，前端查询时显示为「已删除」状态
   （通过文档列表接口返回 deleted 状态文档的 id，前端据此渲染）
```

### 9.7 数据库 Schema

```sql
CREATE TABLE knowledge_documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id),
  name        VARCHAR(256) NOT NULL,
  size        BIGINT NOT NULL,
  mime_type   VARCHAR(128) NOT NULL,
  s3_key      VARCHAR(512) NOT NULL,
  status      VARCHAR(32) NOT NULL DEFAULT 'processing',
              -- 'uploading' | 'processing' | 'ready' | 'failed' | 'deleted'
  fail_reason TEXT,
  is_public   BOOLEAN NOT NULL DEFAULT false,  -- 公共知识库（IT 自助文档等）
  chunk_count INT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_knowledge_user ON knowledge_documents(user_id, status, created_at DESC);

-- pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id      UUID NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  chunk_index INT NOT NULL,
  embedding   vector(1536) NOT NULL,   -- text-embedding-3-small 维度
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chunks_doc ON document_chunks(doc_id);
-- HNSW 索引，加速向量检索
CREATE INDEX idx_chunks_embedding ON document_chunks
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

---

## 10. 模块七：数据层

### 10.1 PostgreSQL

**实例规格建议（生产）**：4 核 16GB，SSD，主从复制，从库承载只读查询。

**关键表清单**

| 表名 | 说明 |
|------|------|
| `users` | 用户账号与基础信息 |
| `sessions` | AI 对话会话 |
| `messages` | 对话消息记录 |
| `expense_records` | 报销单 |
| `leave_balances` | 假期余额 |
| `leave_records` | 请假申请 |
| `meeting_rooms` | 会议室信息 |
| `meeting_bookings` | 会议室预定记录 |
| `it_tickets` | IT 工单 |
| `knowledge_documents` | 知识库文档 meta |
| `document_chunks` | 文档分块与向量 |
| `audit_logs` | 审计日志 |

**审计日志表**

```sql
CREATE TABLE audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id   UUID NOT NULL REFERENCES users(id),
  action     VARCHAR(64) NOT NULL,    -- 'contact.view' | 'approval.query' 等
  target_id  UUID,                    -- 被操作的对象 ID
  target_type VARCHAR(32),            -- 'user' | 'expense' | 'leave' 等
  metadata   JSONB,                   -- 额外上下文（角色、IP 等）
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 审计日志只写不改，禁止 UPDATE / DELETE
CREATE RULE no_update_audit AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
CREATE RULE no_delete_audit AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

CREATE INDEX idx_audit_actor ON audit_logs(actor_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_logs(action, created_at DESC);
```

### 10.2 Redis

**Key 设计规范**

| Key 模式 | TTL | 用途 |
|----------|-----|------|
| `refresh_token:{token}` | 7d | Refresh Token → userId 映射 |
| `jwt_blacklist:{jti}` | 与 Token 剩余有效期一致 | 主动登出 |
| `login_fail:{username}` | 30min | 登录失败计数 |
| `login_locked:{username}` | 30min | 账号锁定标记 |
| `idempotency:{endpoint}:{key}` | 24h | 写操作幂等响应缓存 |
| `contact_cache:{userId}` | 5min | 通讯录热点缓存 |

### 10.3 对象存储

**Bucket 结构**

```
bucket/
├── knowledge/{userId}/{docId}/{filename}     用户私有文档
├── invoices/{userId}/{expenseId}/{filename}  报销发票
└── public/it-docs/{docId}/{filename}         IT 公共文档
```

**访问控制**：所有文件通过 Pre-signed URL 访问，有效期 15 分钟，不暴露真实 Bucket 路径。上传时校验文件 Magic Bytes（前 4-8 字节）与声明的 MIME Type 是否一致，防止恶意文件伪装。

---

## 11. 非功能性要求

### 11.1 性能目标

| 指标 | 目标 |
|------|------|
| 普通 API 响应时间（P99） | ≤ 200ms |
| AI 第一个 Token 延迟（TTFT） | ≤ 2s |
| 文件解析任务完成时间（1MB PDF） | ≤ 30s |
| 并发用户数 | 200（MVP 阶段） |

### 11.2 安全要求

- **HTTPS Only**：禁止 HTTP，HSTS 头部开启
- **SQL 注入防护**：全部使用 Prisma 参数化查询，禁止字符串拼接 SQL
- **XSS 防护**：AI 生成内容渲染时使用 `DOMPurify` 净化，Skill 卡片数据通过 React 受控渲染，不使用 `dangerouslySetInnerHTML`
- **文件上传安全**：Magic Bytes 校验 + MIME Type 白名单 + 文件大小限制（单文件 ≤ 20MB）
- **LLM Prompt 注入防护**：用户上传的文档内容在注入 Prompt 前，过滤 `Ignore previous instructions` 等常见注入模式
- **敏感数据**：手机号、邮箱在审计日志中脱敏存储（仅记录后四位 / 域名部分）

### 11.3 LLM 内容安全

涉及企业制度、规章查询的 AI 回答，System Prompt 强制注入免责声明，前端在对应消息底部固定展示：

```
ℹ️ 以上信息由 AI 生成，仅供参考，请以企业实际政策为准。
```

### 11.4 可观测性

**日志**：使用 Pino，JSON 格式，每条日志包含：

```json
{
  "level": "info",
  "traceId": "abc-123",
  "userId": "user_xyz",
  "method": "POST",
  "path": "/api/chat/message",
  "statusCode": 200,
  "durationMs": 145,
  "msg": "request completed"
}
```

**监控指标（Prometheus）**

| 指标名 | 类型 | 说明 |
|--------|------|------|
| `api_request_duration_seconds` | Histogram | API 响应时间分布 |
| `ai_ttft_seconds` | Histogram | AI 首 Token 延迟 |
| `skill_trigger_total` | Counter | 各 Skill 触发次数（按 skillType 分组） |
| `skill_submit_total` | Counter | 写操作 Skill 提交次数（含成功/失败） |
| `document_processing_duration_seconds` | Histogram | 文件解析耗时 |
| `document_processing_failures_total` | Counter | 文件解析失败次数（按原因分组） |

**告警规则**

| 条件 | 告警级别 |
|------|----------|
| API P99 > 500ms 持续 5min | Warning |
| AI TTFT P95 > 5s 持续 3min | Warning |
| 5xx 错误率 > 1% 持续 2min | Critical |
| 文件解析失败率 > 10% 持续 10min | Warning |

---

## 12. 部署架构

### 12.1 容器化

每个服务独立容器，通过 Docker Compose 组织（开发）/ Kubernetes Deployment（生产）：

```yaml
# docker-compose.yml（开发环境）
services:
  frontend:
    build: ./frontend
    ports: ["3000:3000"]

  api-gateway:
    build: ./services/gateway
    ports: ["4000:4000"]
    environment:
      - DATABASE_URL=postgresql://...
      - REDIS_URL=redis://redis:6379

  ai-service:
    build: ./services/ai
    environment:
      - OPENAI_API_KEY=${OPENAI_API_KEY}

  business-service:
    build: ./services/business

  knowledge-service:
    build: ./services/knowledge

  knowledge-worker:
    build: ./services/knowledge
    command: node worker.js

  postgres:
    image: pgvector/pgvector:pg16
    volumes: ["pgdata:/var/lib/postgresql/data"]

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio     # 本地 S3 兼容存储
    command: server /data
```

### 12.2 环境变量管理

敏感配置（API Key、数据库密码）通过环境变量注入，禁止硬编码在代码中。生产环境使用 Kubernetes Secrets 或云服务的 Secret Manager。

### 12.3 数据库迁移

使用 Prisma Migrate 管理数据库版本，CI/CD 流程中自动执行：

```bash
# 生产部署前
npx prisma migrate deploy
```

---

## 13. 开发阶段划分

### Phase 1 — MVP（核心流程可跑通）

**目标**：用户能登录、发起对话、触发至少 3 个 Skill（请假、报销、通讯录），知识库可上传和问答。

| 模块 | 交付内容 |
|------|----------|
| 前端 | 登录页、对话界面、Skill 卡片（请假/报销/通讯录）、确认机制 |
| 网关 | JWT 鉴权、路由、服务层字段裁剪 |
| 认证 | 登录/登出/刷新 Token、账号锁定 |
| AI 服务 | 普通对话、Intent 识别（3 个 Skill）、SSE 流式输出 |
| 业务服务 | 报销（创建+查询）、请假（创建+查询+余额）、通讯录（查询） |
| 知识库 | 文件上传（PDF/TXT）、异步解析、向量检索、doc-qa |
| 数据层 | 全部 Schema 初始化、Redis 基础配置 |

### Phase 2 — 功能完善

| 模块 | 交付内容 |
|------|----------|
| 前端 | 会议预定、IT 工单、日程、历史记录抽屉、知识库管理页 |
| AI 服务 | 全部 7 个 Skill、多 Skill 命中、Context Window 截断处理 |
| 业务服务 | 会议室预定（含冲突检测）、IT 工单（含转人工）、审批进度查询 |
| 安全 | Prompt 注入过滤、文件 Magic Bytes 校验、审计日志完整接入 |
| 可观测 | Prometheus 指标接入、结构化日志 traceId |

### Phase 3 — 稳定性与体验

| 模块 | 交付内容 |
|------|----------|
| 前端 | 消息发送三态、Context Window 警告提示、Bypass Chip 视觉优化 |
| 性能 | 通讯录 Redis 缓存、数据库慢查询优化、pgvector HNSW 索引调优 |
| 监控 | 告警规则配置、Dashboard 搭建 |
| 测试 | 核心 Skill 端到端测试、权限校验单元测试 |

---

*文档结束*
