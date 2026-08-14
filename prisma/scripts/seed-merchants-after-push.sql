-- Phase 2: run AFTER `prisma db push` completes
-- Only insert merchants for non-null clerkUserId (never empty string)

INSERT INTO "Merchant" ("clerkUserId", "freeMinutesGranted", "createdAt", "updatedAt")
SELECT DISTINCT s."clerkUserId", false, NOW(), NOW()
FROM "Store" s
WHERE s."clerkUserId" IS NOT NULL
  AND TRIM(s."clerkUserId") <> ''
ON CONFLICT ("clerkUserId") DO NOTHING;

INSERT INTO "BillingConfig" ("id", "ratePerMinuteUsd", "freeMinutesOnSignup", "maxGrantPerAction", "currency", "updatedAt")
VALUES ('default', 0.08, 25, 500, 'USD', NOW())
ON CONFLICT ("id") DO NOTHING;
