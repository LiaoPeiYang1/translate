import { PrismaClient } from '@prisma/client';

// singleton prisma client to reuse across routes
const prisma = new PrismaClient({
  log: process.env.PRISMA_LOG_QUERIES === 'true' ? ['error', 'warn', 'query'] : ['error', 'warn']
});

export default prisma;
