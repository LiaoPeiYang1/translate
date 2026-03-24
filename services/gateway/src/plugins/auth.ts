import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { Role } from '@app/types';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

interface JwtPayload extends AuthUser {
  exp: number;
  iat: number;
}

const defaultSecret = 'dev-secret-change-me';

async function authPlugin(fastify: any) {
  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const queryToken = (request.query as any)?.token as string | undefined;
    const bearer = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const token = bearer || queryToken;
    if (!token) {
      return reply.status(401).send({ error: { code: 'AUTH_UNAUTHORIZED', message: 'Missing token' } });
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET || defaultSecret) as JwtPayload;
      request.user = {
        id: payload.id,
        name: payload.name,
        role: payload.role,
        email: payload.email
      };
    } catch (err) {
      return reply.status(401).send({ error: { code: 'AUTH_INVALID_TOKEN', message: 'Token invalid or expired' } });
    }
  });
}

export default fp(authPlugin);
