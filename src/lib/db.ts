/*
 * Prisma client singleton.
 *
 * Next dev reloads modules on every edit, and a fresh PrismaClient per reload
 * exhausts the connection pool within a few saves. The global cache is the
 * standard fix and is dev-only by design: in production each serverless
 * instance constructs exactly one.
 *
 * CONNECTION CHOICE. The app runtime uses DATABASE_URL, which is Neon's POOLED
 * endpoint, because serverless invocations are many and short-lived. Migrations
 * and admin scripts use DIRECT_URL instead: the pooler caches query plans, so a
 * column type change makes a pooled connection fail with "cached plan must not
 * change result type". Do not point migrations at the pooled URL.
 */

import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
