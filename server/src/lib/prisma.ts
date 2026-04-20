import { PrismaClient } from '@prisma/client';

// 개발 중 hot reload 로 인해 여러 번 인스턴스화되는 것 방지
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
