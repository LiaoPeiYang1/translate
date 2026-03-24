import fp from 'fastify-plugin';
import Redis from 'ioredis';

const TTL_SECONDS = 24 * 60 * 60;

function buildKey(method: string, url: string, key: string) {
  return `idempotency:${method}:${url}:${key}`;
}

const memoryStore = new Map<string, { expiresAt: number; payload: any }>();

async function idempotencyPlugin(fastify: any) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redis: Redis | null = null;
  let useMemory = false;
  try {
    redis = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      retryStrategy: () => null,
      reconnectOnError: () => false
    });
    await redis.connect();
    fastify.log.info({ redisUrl }, 'idempotency using redis');
  } catch (err) {
    useMemory = true;
    if (redis) {
      try {
        redis.disconnect();
      } catch (_) {}
    }
    fastify.log.warn({ err }, 'redis not available, falling back to in-memory idempotency (dev only)');
    redis = null;
  }

  fastify.decorate('redis', redis);

  fastify.addHook('preHandler', async (request: any, reply: any) => {
    if (request.method === 'GET') return;

    const endpoint = request.routerPath || request.url;
    const isSkillWrite = endpoint?.includes('/api/skills/');
    if (!isSkillWrite) return;

    const key = request.headers['idempotency-key'];
    if (!key) {
      return reply.status(400).send({ error: { code: 'SKILL_IDEMPOTENCY_KEY_MISSING', message: 'Idempotency-Key header is required' } });
    }
    const cacheKey = buildKey(request.method, endpoint, key);

    if (useMemory) {
      const cached = memoryStore.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return reply.send(cached.payload);
      }
    } else if (redis) {
      const cached = await redis.get(cacheKey);
      if (cached) return reply.send(JSON.parse(cached));
    }

    request.idempotencyKey = cacheKey;
  });

  fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
    if (request.idempotencyKey && reply.statusCode < 500) {
      if (useMemory || !redis) {
        memoryStore.set(request.idempotencyKey, { expiresAt: Date.now() + TTL_SECONDS * 1000, payload });
      } else if (redis) {
        await redis.setex(request.idempotencyKey, TTL_SECONDS, typeof payload === 'string' ? payload : JSON.stringify(payload));
      }
    }
  });
}

export default fp(idempotencyPlugin);
