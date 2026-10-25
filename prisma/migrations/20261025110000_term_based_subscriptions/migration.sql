-- All subscription plans now cover an academic term; map existing plan rows to that interval.
CREATE TYPE "BillingInterval_new" AS ENUM ('TERM');
ALTER TABLE "SubscriptionPlan"
  ALTER COLUMN "interval" TYPE "BillingInterval_new"
  USING ('TERM'::"BillingInterval_new");
DROP TYPE "BillingInterval";
ALTER TYPE "BillingInterval_new" RENAME TO "BillingInterval";

ALTER TABLE "SchoolSubscription"
  ADD COLUMN "billingTermId" TEXT,
  ADD COLUMN "lastTermReminderSentAt" TIMESTAMP(3);

CREATE INDEX "SchoolSubscription_billingTermId_idx" ON "SchoolSubscription"("billingTermId");
ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_billingTermId_fkey"
  FOREIGN KEY ("billingTermId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Attach existing subscriptions to the current academic term, or the next configured term.
UPDATE "SchoolSubscription" AS subscription
SET "billingTermId" = (
  SELECT term."id"
  FROM "Term" AS term
  WHERE term."schoolId" = subscription."schoolId"
    AND term."endDate" >= CURRENT_DATE
  ORDER BY
    CASE WHEN term."startDate" <= CURRENT_DATE THEN 0 ELSE 1 END,
    term."startDate" ASC
  LIMIT 1
)
WHERE subscription."billingTermId" IS NULL
  AND subscription."status" IN ('TRIALING', 'ACTIVE', 'CANCELED')
  AND EXISTS (
    SELECT 1 FROM "Term" AS term
    WHERE term."schoolId" = subscription."schoolId"
      AND term."endDate" >= CURRENT_DATE
  );

UPDATE "SchoolSubscription" AS subscription
SET "currentPeriodStart" = term."startDate",
    "currentPeriodEnd" = term."endDate"::timestamp + INTERVAL '1 day' - INTERVAL '1 millisecond'
FROM "Term" AS term
WHERE subscription."billingTermId" = term."id"
  AND subscription."status" IN ('ACTIVE', 'CANCELED')
  AND (subscription."currentPeriodEnd" IS NULL OR subscription."currentPeriodEnd" > CURRENT_TIMESTAMP);
