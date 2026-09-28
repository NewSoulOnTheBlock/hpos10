import type { PrismaClient } from '@prisma/client'

/**
 * Accrued-but-unclaimed reflections for one owner, raw quote units.
 * Accruals are payout rows without a transfer signature in DONE epochs
 * (rows with a signature were pushed under the old model and are paid).
 */
export async function claimableFor(prisma: PrismaClient, owner: string): Promise<{ accrued: bigint; reserved: bigint; claimable: bigint }> {
  const [row] = await prisma.$queryRaw<{ accrued: string | null; reserved: string | null }[]>`
    SELECT
      (SELECT COALESCE(SUM(p."amount"), 0) FROM "ReflectionPayout" p JOIN "ReflectionEpoch" e ON e."id" = p."epochId"
        WHERE p."owner" = ${owner} AND p."signature" IS NULL AND e."status" = 'DONE')::text AS accrued,
      (SELECT COALESCE(SUM(c."amount"), 0) FROM "Claim" c WHERE c."owner" = ${owner} AND c."status" IN ('PENDING', 'LANDED'))::text AS reserved`
  const accrued = BigInt(row?.accrued?.split('.')[0] ?? '0')
  const reserved = BigInt(row?.reserved?.split('.')[0] ?? '0')
  return { accrued, reserved, claimable: accrued > reserved ? accrued - reserved : 0n }
}

/** Everything the vault owes holders across all owners: unclaimed accruals (pending claims count as owed until they land). */
export async function totalUnclaimed(prisma: PrismaClient): Promise<bigint> {
  const [row] = await prisma.$queryRaw<{ owed: string | null }[]>`
    SELECT (
      (SELECT COALESCE(SUM(p."amount"), 0) FROM "ReflectionPayout" p JOIN "ReflectionEpoch" e ON e."id" = p."epochId"
        WHERE p."signature" IS NULL AND e."status" = 'DONE')
      - (SELECT COALESCE(SUM(c."amount"), 0) FROM "Claim" c WHERE c."status" = 'LANDED')
    )::text AS owed`
  return BigInt(row?.owed?.split('.')[0] ?? '0')
}
