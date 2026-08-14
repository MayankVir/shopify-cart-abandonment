-- Phase 1: run BEFORE `prisma db push` (while Merchant table may not exist yet)
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "clerkUserId" TEXT;

UPDATE "Store"
SET "clerkUserId" = "userId"
WHERE "clerkUserId" IS NULL
  AND "userId" IS NOT NULL;
