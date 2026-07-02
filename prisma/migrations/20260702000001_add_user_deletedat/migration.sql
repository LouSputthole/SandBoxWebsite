-- AlterTable
-- Self-service account deletion: nullable tombstone timestamp on User. Additive
-- nullable column, so it applies cleanly to prod on the next `prisma migrate deploy`.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
