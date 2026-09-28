import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

/** VANITY_ENCRYPTION_KEY: 32 bytes as 64 hex chars (`openssl rand -hex 32`). */
function keyFrom(hex: string): Buffer {
  const k = Buffer.from(hex, 'hex')
  if (k.length !== 32) throw new Error('VANITY_ENCRYPTION_KEY must be 32 bytes (64 hex chars)')
  return k
}

export function sealSecret(secret: Uint8Array, hexKey: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', keyFrom(hexKey), iv)
  const body = Buffer.concat([c.update(secret), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64')
}

export function openSecret(sealed: string, hexKey: string): Uint8Array {
  const raw = Buffer.from(sealed, 'base64')
  const d = createDecipheriv('aes-256-gcm', keyFrom(hexKey), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return new Uint8Array(Buffer.concat([d.update(raw.subarray(28)), d.final()]))
}

/** A creator who retries a launch within this window gets the same vanity mint back. */
export const VANITY_HOLD_MINUTES = 10

/**
 * Take one vanity mint for a launch. Every address is handed out at most
 * once, to one creator:
 *   - the same creator retrying within the hold window gets their own
 *     reserved (not yet launched) mint back;
 *   - otherwise a never-reserved mint is taken;
 *   - a mint reserved by someone else is never given out again, even if that
 *     launch was abandoned.
 * SKIP LOCKED makes simultaneous launches safe. The caller still checks the
 * mint is not on-chain before using it.
 */
export async function reserveVanityMint(prisma: PrismaClient, creator: string): Promise<{ pubkey: string; secret: string } | null> {
  const mine = await prisma.$queryRaw<{ pubkey: string; secret: string }[]>`
    SELECT "pubkey", "secret" FROM "VanityMint"
    WHERE "usedAt" IS NULL AND "reservedBy" = ${creator}
      AND "reservedAt" > NOW() - (${VANITY_HOLD_MINUTES} || ' minutes')::interval
    ORDER BY "reservedAt" DESC
    LIMIT 1`
  if (mine[0]) return mine[0]
  const rows = await prisma.$queryRaw<{ pubkey: string; secret: string }[]>`
    UPDATE "VanityMint" SET "reservedAt" = NOW(), "reservedBy" = ${creator}
    WHERE "pubkey" = (
      SELECT "pubkey" FROM "VanityMint"
      WHERE "usedAt" IS NULL AND "reservedAt" IS NULL
      ORDER BY "createdAt"
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "pubkey", "secret"`
  return rows[0] ?? null
}

/** Retire a mint for good (it landed on-chain, or turned out to exist already). */
export async function retireVanityMint(prisma: PrismaClient, pubkey: string): Promise<void> {
  await prisma.vanityMint.updateMany({ where: { pubkey, usedAt: null }, data: { usedAt: new Date() } })
}

/**
 * Undo a reservation whose transaction was never returned to anyone (the
 * build failed). The address never left the server, so it is still unused.
 */
export async function releaseVanityMint(prisma: PrismaClient, pubkey: string): Promise<void> {
  await prisma.vanityMint.updateMany({ where: { pubkey, usedAt: null }, data: { reservedAt: null, reservedBy: null } })
}
