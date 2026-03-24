# CLAUDE.md — 超级员工助手 (The Cognitive Editorial)

本文件是给 AI 编码助手（Claude Code 等）的项目上下文。阅读完整后再开始任何编码任务。

---

## 项目概况

企业级 AI 办公助手，用户通过自然语言对话完成报销、请假、会议室预定、IT 报修、通讯录查询等高频事务。AI 识别意图后渲染可交互的 Skill 卡片，用户确认后触发真实的业务写操作。

**对应文档**
- 需求文档：`PRD_SuperEmployee_v3.md`
- 技术方案：`TECH_SPEC.md`

---

## Monorepo 结构

```
/
├── frontend/          # React 18 + TypeScript + Vite
├── services/
│   ├── gateway/       # API 网关 / BFF（Fastify）
│   ├── auth/          # 认证服务（Fastify）
│   ├── ai/            # AI 对话服务（Fastify + SSE）
│   ├── business/      # 业务服务（Fastify）
│   └── knowledge/     # 知识库服务 + Worker（Fastify + BullMQ）
├── packages/
│   ├── types/         # 跨服务共享 TypeScript 类型
│   └── db/            # Prisma schema 与生成客户端
├── docker-compose.yml
└── CLAUDE.md          # 本文件
```

---

## 技术栈速查

| 层 | 技术 |
|----|------|
| 前端框架 | React 18 + TypeScript |
| 前端构建 | Vite |
| 状态管理 | Zustand |
| UI 组件 | Shadcn/ui + Tailwind CSS |
| AI 流式 | 原生 `EventSource` (SSE) |
| HTTP 客户端 | Axios + React Query |
| 后端框架 | Fastify (Node.js 20) |
| ORM | Prisma |
| 任务队列 | BullMQ (Redis) |
| 日志 | Pino |
| 数据库 | PostgreSQL 16 + pgvector |
| 缓存 | Redis 7 |
| 对象存储 | S3 兼容接口 |
| LLM | OpenAI GPT-4o（Function Calling） |
| Embedding | text-embedding-3-small（1536 维） |

---

## 核心设计原则（编码时必须遵守）

### 1. AI 不直接执行写操作

AI 服务只负责识别意图、返回 Skill 卡片数据。**绝对不允许** AI 服务直接调用业务写接口。写操作流程：

```
AI 返回 skill 事件 → 前端渲染卡片 → 用户填写并点击「确认提交」→ 前端调业务接口
```

### 2. 权限双层校验，缺一不可

- **前端（展示层）**：根据 `authStore` 中的 `role` 决定字段是否渲染，使用 `usePermission` hook
- **后端（服务层）**：网关在响应返回前按 `RESPONSE_FIELD_POLICY` 裁剪字段，**字段设为 `null` 而不是删除**

永远不要只做其中一层。

### 3. 所有写操作接口必须幂等

写接口（`POST /api/skills/*/create` 等）必须：
1. 要求客户端传 `Idempotency-Key` header（UUID）
2. 用 `idempotency:{endpoint}:{key}` 作 Redis key 缓存响应，TTL 24h
3. 命中缓存时直接返回原响应，不重新执行业务逻辑

### 4. 异步优先

文件解析、Embedding 生成等耗时操作**必须走 BullMQ 队列**，不允许在请求处理函数内同步等待。

---

## 前端编码规范

### 组件结构

```typescript
// 每个 Skill 卡片组件的标准结构
// services/skills/ExpenseCard.tsx

interface ExpenseCardProps {
  payload: ExpensePayload;       // AI 返回的预填数据
  initialState?: SkillCardState; // 历史恢复时传入
}

export function ExpenseCard({ payload, initialState = 'filling' }: ExpenseCardProps) {
  // 1. 本地表单状态
  // 2. useIdempotentMutation hook
  // 3. 确认提交逻辑
  // 4. 渲染：根据 state 显示填写态 / 确认栏 / 加载态 / 只读态 / 错误态
}
```

### SkillCardState 状态机

每张写操作卡片必须实现完整的状态流转：

```
filling → confirming → submitting → submitted
                    ↘ (取消)    ↘ failed → filling (重试)
```

只读卡片（`schedule`、`contact`）直接使用 `readonly` 状态，不需要确认流程。

### 消息发送三态

用户消息必须维护 `sending / delivered / failed` 三态，`failed` 时显示重试按钮：

```typescript
// chatStore.ts 中维护
interface UserMessage {
  id: string;
  content: string;
  status: 'sending' | 'delivered' | 'failed';
  contextDocIds: string[];
}
```

### SSE 事件处理

```typescript
// useSSE.ts 中处理的事件类型
// event: text   → { delta: string }         追加到当前 AI 消息
// event: skill  → { skillType, payload }    挂载对应 Skill 卡片
// event: done   → { messageId, sessionId }  标记消息完成
// event: error  → { code, message }         显示错误
// event: warning → { message }              显示上下文截断提示
```

### 权限 Hook 用法

```typescript
const { canSee } = usePermission();

// 渲染前检查
{canSee('contact.phone') && <span>{contact.phone}</span>}
{!canSee('contact.phone') && <span className="text-muted">无权查看</span>}
```

字段名定义在 `hooks/usePermission.ts` 的 `FIELD_VISIBILITY` 对象中，新增字段时在该对象统一维护。

### Bypass Chip 视觉规范

`bypassed: true` 的文档 Chip 必须有明确的视觉区分：灰色背景 + 删除线文字。不能只靠 tooltip 提示。

```tsx
<Chip
  className={doc.bypassed ? 'opacity-50 line-through' : ''}
  label={doc.name}
/>
```

---

## 后端编码规范

### 接口返回格式

所有接口统一返回格式：

```typescript
// 成功
{ "data": T, "meta"?: object }

// 失败
{ "error": { "code": string, "message": string } }
```

HTTP 状态码语义：`200` 成功，`400` 参数错误，`401` 未登录，`403` 无权限，`404` 资源不存在，`409` 冲突（如会议室已被预定），`422` 业务规则不满足（如余额不足），`429` 限流，`500` 服务内部错误。

### 错误码规范

```typescript
// 格式：MODULE_SNAKE_CASE
'AUTH_INVALID_CREDENTIALS'
'AUTH_ACCOUNT_LOCKED'
'LEAVE_INSUFFICIENT_BALANCE'
'MEETING_ROOM_CONFLICT'
'KNOWLEDGE_UNSUPPORTED_FORMAT'
'SKILL_IDEMPOTENCY_KEY_MISSING'
```

### 幂等中间件

写操作路由必须挂载幂等中间件：

```typescript
// middleware/idempotency.ts
fastify.addHook('preHandler', async (request, reply) => {
  const key = request.headers['idempotency-key'];
  if (!key) {
    return reply.status(400).send({ error: { code: 'SKILL_IDEMPOTENCY_KEY_MISSING', message: 'Idempotency-Key header is required' } });
  }
  const cached = await redis.get(`idempotency:${request.url}:${key}`);
  if (cached) {
    return reply.send(JSON.parse(cached));  // 直接返回缓存，不继续执行
  }
  // 请求处理完成后缓存响应
  request.idempotencyKey = key;
});
```

### 日志规范

所有日志通过 Pino logger，不使用 `console.log`：

```typescript
// 每条日志必须包含 traceId
logger.info({ traceId, userId, action: 'expense.create', expenseId }, 'expense created');

// 错误日志必须包含 err 对象
logger.error({ traceId, userId, err }, 'failed to create expense');
```

`traceId` 在网关层生成，通过 `request.traceId` 传递，下游服务从请求上下文中读取。

### 数据库操作规范

- **全部使用 Prisma**，禁止字符串拼接 SQL
- 需要原生 SQL 时使用 `prisma.$queryRaw` + `Prisma.sql` 模板标签（自动参数化）
- 事务内操作使用 `prisma.$transaction`
- **禁止在循环内执行数据库查询**，改用批量查询后内存过滤

```typescript
// 错误示例
for (const id of ids) {
  const user = await prisma.users.findUnique({ where: { id } }); // N+1
}

// 正确示例
const users = await prisma.users.findMany({ where: { id: { in: ids } } });
const userMap = new Map(users.map(u => [u.id, u]));
```

### 审计日志写入时机

以下操作必须写 `audit_logs`，不可遗漏：

| 操作 | action 值 |
|------|-----------|
| 查询他人通讯录详情 | `contact.view` |
| 管理层/HR 查询全员审批 | `approval.query_all` |
| 驳回任意审批单 | `approval.reject` |

写入方式：在业务逻辑成功后异步写入（不阻塞响应），失败时记录错误日志但不影响主流程。

---

## AI 服务编码规范

### System Prompt 注入顺序

```typescript
const systemPrompt = [
  buildBasePrompt(user),          // 用户信息 + 能力说明 + 规则
  buildKnowledgeContext(chunks),  // 知识库检索结果（可能为空）
].join('\n\n');
```

每次请求**重新构建** System Prompt，不缓存带用户信息的 Prompt。

### Function Calling 工具定义

7 个 Skill 工具定义在 `services/ai/src/tools/index.ts` 中统一维护。新增或修改 Skill 时只改此文件，不散落在各处。

### 多 Skill 命中处理顺序

LLM 返回多个 tool_calls 时，按以下固定顺序推送 `skill` SSE 事件：

```
leave → meeting → expense → it → contact → schedule → doc_qa
```

### 免责声明注入

检测到以下关键词时，在 System Prompt 中追加免责声明指令：

```typescript
const POLICY_KEYWORDS = ['制度', '规定', '政策', '流程', '标准', '规章', '条例'];

if (POLICY_KEYWORDS.some(kw => userMessage.includes(kw))) {
  systemPrompt += '\n\n注意：本次回答涉及规章制度，回答末尾必须附加免责声明。';
}
```

前端在 AI 消息底部固定渲染免责声明条（由后端在 `done` 事件中携带 `requiresDisclaimer: true` 标志触发）。

### Context Window 截断

```typescript
const MAX_CONTEXT_TOKENS = MODEL_LIMIT * 0.8;
const SYSTEM_PROMPT_BUDGET = 500;
const KNOWLEDGE_BUDGET = 4000;
const HISTORY_BUDGET = MAX_CONTEXT_TOKENS - SYSTEM_PROMPT_BUDGET - KNOWLEDGE_BUDGET;

// 历史消息从最新往旧填充，超出 HISTORY_BUDGET 时停止
// 截断时通过 SSE 推送 warning 事件通知前端
```

---

## 知识库 Worker 规范

Worker 文件：`services/knowledge/src/worker.ts`

错误处理规则：
- OCR / 文本提取失败 → 状态设为 `failed`，`fail_reason` 写具体原因，BullMQ 重试最多 2 次
- Embedding API 失败 → 同上，重试前等待 exponential backoff
- **不允许 Worker 抛出未捕获异常导致进程崩溃**，所有异常必须在 job handler 内捕获

分块参数（不允许随意修改）：
- `chunkSize`: 512 token
- `overlap`: 128 token
- Embedding 模型：`text-embedding-3-small`（维度 1536）

---

## 数据库规范

### 命名约定

- 表名：`snake_case` 复数（`expense_records`、`leave_balances`）
- 字段名：`snake_case`（`created_at`、`user_id`）
- 索引名：`idx_{表名}_{字段}` 或 `idx_{表名}_{字段1}_{字段2}`

### 必须有索引的场景

- 所有外键字段
- 按时间倒序查询的 `created_at` / `updated_at`
- 状态过滤字段（`status`）与 userId 的复合索引

### 审计日志防篡改

`audit_logs` 表已通过 PostgreSQL RULE 禁止 UPDATE 和 DELETE，业务代码**不要尝试修改审计日志**。

### Prisma Migration 规范

- 每次 Schema 变更新建 migration，不直接修改现有 migration 文件
- Migration 名称用英文描述变更内容：`add_rejection_reason_to_expense`
- 生产部署前运行 `npx prisma migrate deploy`，**不使用** `prisma migrate reset`

---

## 环境变量

所有服务的环境变量通过 `.env` 文件管理（开发）或 Kubernetes Secrets（生产）。**不允许在代码中硬编码任何密钥或敏感配置。**

必须存在的环境变量（缺少时服务启动失败）：

```bash
# 数据库
DATABASE_URL=postgresql://user:pass@localhost:5432/cognitive_editorial

# Redis
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=                    # 至少 32 字符随机字符串
JWT_ACCESS_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d

# OpenAI
OPENAI_API_KEY=

# 对象存储
S3_BUCKET=
S3_REGION=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_ENDPOINT=                   # 使用 MinIO 或其他兼容服务时填写
```

---

## 开发启动

```bash
# 安装依赖
pnpm install

# 启动基础设施（PG + Redis + MinIO）
docker-compose up -d postgres redis minio

# 数据库初始化
cd packages/db && npx prisma migrate dev

# 启动所有服务（开发模式）
pnpm dev

# 仅启动前端
pnpm --filter frontend dev

# 仅启动某个后端服务
pnpm --filter @app/ai-service dev
```

---

## 当前开发阶段

**Phase 1 — MVP**，目标是以下流程端到端跑通：

1. 用户登录
2. 发起自然语言对话
3. 触发请假 / 报销 / 通讯录三个 Skill
4. 写操作经确认机制提交
5. 知识库上传 PDF 并基于文档问答

Phase 2（会议预定、IT 工单、历史记录等）在 Phase 1 验收后启动。

**新功能开发前请先确认当前 Phase 范围，不要提前实现 Phase 2 的功能。**

---

## 常见问题 / 注意事项

**Q: 通讯录接口为什么某些字段返回 `null` 而不是不返回该字段？**  
A: 前端需要知道字段「存在但无权查看」（显示「无权限」占位），而不是字段「不存在」（直接不渲染）。两种情况前端渲染逻辑不同。

**Q: 为什么 Idempotency-Key 在卡片挂载时生成而不是每次点击提交时生成？**  
A: 如果每次点击都生成新 Key，网络抖动导致的重试就无法去重。Key 必须在整个卡片生命周期内唯一且固定。

**Q: 历史会话中的 Skill 卡片应该展示当时状态还是最新状态？**  
A: 快照模式——展示提交时的状态（存储在 `messages.skill_cards` JSONB 中），不实时拉取。卡片渲染为只读态，显示提交时间戳。

**Q: 文档被删除后历史对话中的 Chip 如何处理？**  
A: 知识库接口返回 `status: 'deleted'` 的文档记录（软删除保留 meta），前端根据此状态将 Chip 渲染为「已删除」样式，不报错。

**Q: 为什么 pgvector 用 HNSW 而不是 IVFFlat？**  
A: HNSW 不需要预训练（IVFFlat 需要先有足够数据才能建有效索引），MVP 阶段数据量小时 HNSW 效果更稳定。数据量增大后可评估切换。
