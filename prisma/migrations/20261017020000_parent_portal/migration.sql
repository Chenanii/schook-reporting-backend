ALTER TABLE "User"
ALTER COLUMN "email" DROP NOT NULL;

DROP INDEX "Parent_userId_key";
CREATE INDEX "Parent_userId_idx" ON "Parent"("userId");

CREATE TABLE "ParentPortalVerification" (
  "id" TEXT NOT NULL,
  "identifierHash" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentPortalVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParentPortalVerification_identifierHash_createdAt_idx"
  ON "ParentPortalVerification"("identifierHash", "createdAt");
CREATE INDEX "ParentPortalVerification_expiresAt_idx"
  ON "ParentPortalVerification"("expiresAt");
