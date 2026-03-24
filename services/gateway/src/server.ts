import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifySse from 'fastify-sse-v2';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { users, contactDirectory, leaveBalances, maskContact, knowledgeDocs, addKnowledgeDoc } from './data/mock.js';
import idempotencyPlugin from './plugins/idempotency.js';
import type { ApiError, ApiSuccess, KnowledgeDoc, Role, SkillPayload, TokenPair } from '@app/types';
import prisma from './db.js';
import axios from 'axios';

const server = Fastify({ logger: true });

server.register(cors, { origin: '*' });
server.register(fastifySse);
server.register(idempotencyPlugin);

const defaultSecret = process.env.JWT_SECRET || 'dev-secret-change-me';

type LoginBody = { email: string; password: string };

function signTokens(payload: { id: string; name: string; email: string; role: Role }): TokenPair {
  const accessToken = jwt.sign(payload, defaultSecret, { expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '2h' });
  const refreshToken = jwt.sign(payload, defaultSecret, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d' });
  return { accessToken, refreshToken };
}

function writeSse(reply: any, event: string, data: any) {
  reply.raw.write(`event: ${event}\n`);
  reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
}

const authenticate = async (request: any, reply: any) => {
  const header = request.headers.authorization as string | undefined;
  const queryToken = request.query?.token as string | undefined;
  const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
  const token = bearer || queryToken;
  if (!token) {
    return reply.status(401).send({ error: { code: 'AUTH_UNAUTHORIZED', message: 'Missing token' } });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || defaultSecret) as any;
    request.user = {
      id: payload.id,
      name: payload.name,
      role: payload.role,
      email: payload.email
    };
  } catch (err) {
    return reply.status(401).send({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token invalid or expired' } });
  }
};

server.get('/health', async () => ({ status: 'ok' }));

server.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
  const { email, password } = request.body;
  let user: any = null;
  if (prismaEnabled) {
    try {
      user = await prisma.user.findUnique({ where: { email } });
    } catch (err) {
      reply.log.error({ err }, 'prisma user lookup failed, falling back to mock');
    }
  }
  if (!user) {
    const mock = users.find(u => u.email === email);
    if (mock && prismaEnabled) {
      try {
        user = await prisma.user.upsert({
          where: { email },
          update: {},
          create: {
            id: mock.id,
            email: mock.email,
            name: mock.name,
            role: mock.role,
            phone: mock.phone ?? null,
            passwordHash: mock.passwordHash
          }
        });
      } catch (err) {
        reply.log.error({ err }, 'prisma upsert mock failed, using in-memory mock');
        user = mock;
      }
    } else if (mock) {
      user = mock;
    }
  }
  if (!user) {
    return reply.status(401).send({ error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' } } satisfies ApiError);
  }
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) {
    return reply.status(401).send({ error: { code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid email or password' } } satisfies ApiError);
  }
  const tokens = signTokens(user as any);
  return reply.send({ data: { user: { id: user.id, name: user.name, role: user.role, email: user.email }, tokens } } satisfies ApiSuccess<any>);
});

server.post('/api/auth/refresh', async (request, reply) => {
  const { refreshToken } = request.body as { refreshToken: string };
  if (!refreshToken) return reply.status(400).send({ error: { code: 'AUTH_REFRESH_MISSING', message: 'refreshToken is required' } });
  try {
    const payload = jwt.verify(refreshToken, defaultSecret) as any;
    const tokens = signTokens(payload);
    return reply.send({ data: tokens } satisfies ApiSuccess<TokenPair>);
  } catch (err) {
    return reply.status(401).send({ error: { code: 'AUTH_REFRESH_INVALID', message: 'Refresh token invalid' } });
  }
});

server.get('/api/users/me', { preHandler: authenticate }, async (request, reply) => {
  return reply.send({ data: request.user } satisfies ApiSuccess<any>);
});

const POLICY_KEYWORDS = ['制度', '规定', '政策', '流程', '标准', '规章', '条例'];
const QWEN_ENDPOINT = process.env.QWEN_ENDPOINT || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = process.env.QWEN_MODEL || 'qwen-turbo';

async function streamQwen(content: string, docContext: string, reply: any) {
  const apiKey = process.env.QWEN_API_KEY;
  if (!apiKey) {
    writeSse(reply, 'error', { code: 'QWEN_API_KEY_MISSING', message: 'QWEN_API_KEY is not set' });
    reply.raw.end();
    return;
  }

  const messages = [
    { role: 'system', content: '你是企业内部助手，回答简洁，并在无法确定时说明。' + docContext },
    { role: 'user', content }
  ];

  let resp;
  try {
    resp = await axios.post(
      QWEN_ENDPOINT,
      { model: QWEN_MODEL, messages, stream: true },
      {
        headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json' },
        responseType: 'stream',
        timeout: 20000
      }
    );
  } catch (err: any) {
    const status = err?.response?.status;
    const msg =
      status === 401
        ? 'QWEN_API_KEY 无效或未授权（401），请检查密钥是否正确、是否有额度，或尝试将 QWEN_ENDPOINT 改为国内地址 https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions。'
        : `调用千问失败：${err?.message || '未知错误'}`;
    writeSse(reply, 'text', { delta: msg });
    writeSse(reply, 'done', { messageId: randomUUID(), requiresDisclaimer: false });
    reply.raw.end();
    return;
  }

  const stream = resp.data;
  return new Promise<void>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      const lines = chunk.toString().split('\n').filter(l => l.startsWith('data:'));
      for (const line of lines) {
        const jsonStr = line.replace(/^data:\s*/, '');
        if (jsonStr.trim() === '[DONE]') continue;
        try {
          const parsed = JSON.parse(jsonStr);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            writeSse(reply, 'text', { delta });
          }
        } catch (err) {
          // ignore parse errors
        }
      }
    });
    stream.on('end', () => {
      writeSse(reply, 'done', { messageId: randomUUID(), requiresDisclaimer: false });
      reply.raw.end();
      resolve();
    });
    stream.on('error', err => {
      writeSse(reply, 'error', { code: 'QWEN_STREAM_ERROR', message: err.message });
      reply.raw.end();
      reject(err);
    });
  });
}

const prismaEnabled = !!process.env.DATABASE_URL;

async function streamChat(content: string, contextDocIds: string[] | undefined, user: any, reply: any) {
  const messageId = randomUUID();
  const docsAll = (contextDocIds || []).map(id => knowledgeDocs.find(d => d.id === id)).filter(Boolean) as KnowledgeDoc[];
  const docs = docsAll.slice(0, 3);

  const docContext =
    docs.length > 0
      ? `\n\n[文档上下文]\n${docs.map(d => `- ${d.name} (${d.status})`).join('\n')}`
      : '';

  let skillPayload: SkillPayload | undefined;
  const lower = content || '';
  const QUICK_HINTS = ['请假', '报销', '费用', '联系', '电话', '通讯录'];
  if (lower.includes('请假')) {
    skillPayload = {
      skillType: 'leave',
      payload: {
        title: '请假申请',
        type: 'annual',
        from: new Date().toISOString().slice(0, 10),
        to: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        days: 1,
        summary: '年假 1 天',
        reason: '个人事务'
      }
    };
  } else if (lower.includes('报销') || lower.includes('费用')) {
    skillPayload = {
      skillType: 'expense',
      payload: {
        title: '差旅报销',
        amount: 680,
        currency: 'CNY',
        category: 'travel',
        date: new Date().toISOString().slice(0, 10),
        memo: '客户拜访打车'
      }
    };
  } else if (lower.includes('联系') || lower.includes('电话')) {
    const contact = contactDirectory[0];
    skillPayload = {
      skillType: 'contact',
      payload: { title: '通讯录', employeeId: contact.id, summary: `${contact.name} - ${contact.title ?? ''}` }
    };
  }

  if (docContext) {
    writeSse(reply, 'text', { delta: docContext });
  }

  if (docs.length > 3) {
    writeSse(reply, 'warning', { message: '上下文文档过多，已自动截断为前 3 个。' });
  }
  const pendingDoc = docs.find(d => d.status !== 'ready');
  if (pendingDoc) {
    writeSse(reply, 'warning', { message: `文档 ${pendingDoc.name} 尚未解析完成，回答可能不包含其内容。` });
  }

  if (skillPayload) {
    const greeting = `你好 ${user?.name}，我是超级员工助手，可以帮你处理报销、请假、通讯录查询等工作。`;
    writeSse(reply, 'text', { delta: greeting });
    writeSse(reply, 'skill', skillPayload);
    const requiresDisclaimer = POLICY_KEYWORDS.some(kw => lower.includes(kw));
    writeSse(reply, 'done', { messageId, requiresDisclaimer });
    reply.raw.end();
  } else {
    try {
      await streamQwen(content, docContext, reply);
      return; // streamQwen 会自行发送 done
    } catch (err: any) {
      writeSse(reply, 'error', { code: 'QWEN_STREAM_ERROR', message: err?.message || 'Qwen request failed' });
      reply.raw.end();
      return;
    }
  }
}

server.post('/api/chat/message', { preHandler: authenticate }, async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  const { content, contextDocIds } = request.body as { content: string; contextDocIds?: string[] };
  await streamChat(content, contextDocIds, request.user, reply);
});

server.get('/api/chat/stream', { preHandler: authenticate }, async (request, reply) => {
  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive'
  });
  const { content = '', contextDocIds = '' } = request.query as { content?: string; contextDocIds?: string };
  const ids = contextDocIds ? contextDocIds.split(',').filter(Boolean) : [];
  await streamChat(content, ids, request.user, reply);
});

server.post('/api/skills/leave/submit', { preHandler: [authenticate] }, async (request, reply) => {
  const body = request.body as any;
  const userId = request.user!.id;
  if (!body.type || !body.from || !body.to || !body.days) {
    return reply.status(400).send({ error: { code: 'LEAVE_BAD_REQUEST', message: '缺少必要字段' } });
  }
  const record = await prisma.leaveRequest.create({
    data: {
      userId,
      type: body.type,
      from: new Date(body.from),
      to: new Date(body.to),
      days: body.days,
      reason: body.reason ?? null,
      status: 'pending'
    }
  });
  return reply.send({ data: record } satisfies ApiSuccess<any>);
});

server.post('/api/skills/expense/submit', { preHandler: [authenticate] }, async (request, reply) => {
  const body = request.body as any;
  if (!body.amount || !body.category || !body.date) {
    return reply.status(400).send({ error: { code: 'EXPENSE_BAD_REQUEST', message: '缺少必要字段' } });
  }
  const record = await prisma.expenseReport.create({
    data: {
      userId: request.user!.id,
      amount: body.amount,
      currency: body.currency ?? 'CNY',
      category: body.category,
      date: new Date(body.date),
      memo: body.memo ?? null,
      status: 'pending'
    }
  });
  return reply.send({ data: record } satisfies ApiSuccess<any>);
});

server.get('/api/skills/contact/:id', { preHandler: [authenticate] }, async (request, reply) => {
  const { id } = request.params as { id: string };
  const contact = await prisma.contact.findUnique({ where: { id } });
  if (!contact) return reply.status(404).send({ error: { code: 'CONTACT_NOT_FOUND', message: 'Contact not found' } });
  const masked = maskContact(contact as any, request.user!.role);
  return reply.send({ data: masked } satisfies ApiSuccess<any>);
});

server.get('/api/skills/schedule/today', { preHandler: [authenticate] }, async (_request, reply) => {
  const schedule = [
    { time: '09:30', title: '项目站会', location: '线上' },
    { time: '11:00', title: '需求澄清', location: 'A3-12' },
    { time: '15:00', title: '代码评审', location: '线上' }
  ];
  return reply.send({ data: schedule } satisfies ApiSuccess<any>);
});

server.get('/api/knowledge/list', { preHandler: [authenticate] }, async (request, reply) => {
  const docs = await prisma.knowledgeDoc.findMany({
    where: { userId: request.user!.id },
    orderBy: { uploadedAt: 'desc' }
  });
  return reply.send({ data: docs } satisfies ApiSuccess<KnowledgeDoc[]>);
});

server.post('/api/knowledge/upload', { preHandler: [authenticate] }, async (request, reply) => {
  const { name, size } = request.body as { name: string; size: number };
  if (!name || !size) return reply.status(400).send({ error: { code: 'KNOWLEDGE_BAD_REQUEST', message: 'name and size required' } });
  if (!/\.(pdf|docx?|txt)$/i.test(name)) {
    return reply.status(422).send({ error: { code: 'KNOWLEDGE_UNSUPPORTED_FORMAT', message: 'Only pdf/doc/txt allowed' } });
  }
  const doc = await prisma.knowledgeDoc.create({
    data: {
      userId: request.user!.id,
      name,
      size,
      status: 'processing',
      uploadedAt: new Date()
    }
  });
  // 模拟异步 Worker 解析，真实环境应改为 BullMQ worker
  setTimeout(async () => {
    const fail = size > 20_000_000;
    await prisma.knowledgeDoc.update({
      where: { id: doc.id },
      data: fail
        ? { status: 'failed', failReason: '文件过大，解析失败' }
        : { status: 'ready', failReason: null }
    });
  }, 500);
  return reply.send({ data: doc } satisfies ApiSuccess<KnowledgeDoc>);
});

async function start() {
  try {
    await server.listen({ port: Number(process.env.PORT) || 3000, host: '0.0.0.0' });
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

if (process.env.NODE_ENV !== 'test') {
  start();
}
