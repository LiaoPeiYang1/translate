# Super Employee MVP Skeleton

This repo implements the Phase 1 MVP from `PRD_SuperEmployee_v3.md` / `TECH_SPEC.md` as a single Fastify gateway with mocked downstream services. It keeps API contracts, idempotency, and dual-layer permission rules so the UI can already integrate.

## Layout
- `services/gateway`: Fastify server exposing auth, chat (SSE), skills (leave/expense/contact/schedule), and knowledge endpoints. Includes idempotency and role-based masking.
- `packages/types`: Shared TypeScript contracts for roles, tokens, skills, SSE events, and knowledge docs.
- `packages/db`: Prisma schema aligned to TECH_SPEC (PostgreSQL + pgvector ready). Not wired yet—stubs run fully in memory.
- `docs/ARCHITECTURE.md`: This file.

## How to run
```bash
pnpm install
pnpm --filter @app/gateway dev
```
Environment (dev defaults baked in):
```bash
PORT=3000
JWT_SECRET=dev-secret-change-me
JWT_ACCESS_EXPIRES_IN=2h
JWT_REFRESH_EXPIRES_IN=7d
```

## Implemented flows (Phase 1)
- **登录**: `POST /api/auth/login` (demo users from mock data), `POST /api/auth/refresh`, `GET /api/users/me`.
- **AI 对话 + SSE**: `POST /api/chat/message` streams `text` tokens, optional `skill` event, and `done` with `requiresDisclaimer` flag when检测到制度/规定关键词。
- **写操作确认 & 幂等**: All `/api/skills/*` POST routes require `Idempotency-Key`; responses cached 24h per SPEC.
- **权限双层校验**: `/api/skills/contact/:id` masks `phone/email/salary` per role (HR/Management only see everything; HR-only for薪资).
- **知识库**: `POST /api/knowledge/upload` (metadata only) + `GET /api/knowledge/list` per user.
- **日程/快捷卡片**: `/api/skills/schedule/today` provides mock schedule.

## Next steps
1. Replace in-memory stores with PostgreSQL + Prisma client from `packages/db`.
2. Split gateway into dedicated services (auth/ai/business/knowledge) if needed; keep contracts stable.
3. Wire Redis-backed idempotency + BullMQ worker for knowledge processing per TECH_SPEC.
4. Add frontend (React + Vite + Zustand + Shadcn) pointing to these endpoints.
