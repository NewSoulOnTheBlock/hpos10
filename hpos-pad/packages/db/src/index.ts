import { PrismaClient } from '@prisma/client'

export * from '@prisma/client'
export * from './mappers.js'
export * from './vanity.js'
export * from './claims.js'

/** One client per process. Pass the URL explicitly so every service validates its own env. */
export function createPrisma(databaseUrl: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url: databaseUrl } } })
}
