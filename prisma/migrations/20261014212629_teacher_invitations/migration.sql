-- Step 1: Add nullable columns so existing records remain valid.
ALTER TABLE "Teacher"
ADD COLUMN "email" TEXT,
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT;

-- Step 2: Backfill existing teacher details from their linked users.
UPDATE "Teacher" AS t
SET
    "email" = u."email",
    "firstName" = u."firstName",
    "lastName" = u."lastName"
FROM "User" AS u
WHERE t."userId" = u."id";

-- Step 3: Stop safely if any existing teacher could not be backfilled.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "Teacher"
        WHERE "email" IS NULL
           OR "firstName" IS NULL
           OR "lastName" IS NULL
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: one or more teachers have no linked user or missing details.';
    END IF;

    IF EXISTS (
        SELECT "email"
        FROM "Teacher"
        GROUP BY "email"
        HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION
            'Migration stopped: duplicate teacher email addresses exist.';
    END IF;
END $$;

-- Step 4: Enforce the new required fields and optional user link.
ALTER TABLE "Teacher"
ALTER COLUMN "email" SET NOT NULL,
ALTER COLUMN "firstName" SET NOT NULL,
ALTER COLUMN "lastName" SET NOT NULL,
ALTER COLUMN "userId" DROP NOT NULL;

-- Step 5: Create the invitation table.
CREATE TABLE "TeacherInvitation" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeacherInvitation_pkey" PRIMARY KEY ("id")
);

-- Step 6: Create indexes.
CREATE UNIQUE INDEX "TeacherInvitation_tokenHash_key"
ON "TeacherInvitation"("tokenHash");

CREATE INDEX "TeacherInvitation_teacherId_createdAt_idx"
ON "TeacherInvitation"("teacherId", "createdAt");

CREATE INDEX "TeacherInvitation_expiresAt_idx"
ON "TeacherInvitation"("expiresAt");

CREATE UNIQUE INDEX "Teacher_email_key"
ON "Teacher"("email");

CREATE INDEX "Teacher_lastName_firstName_idx"
ON "Teacher"("lastName", "firstName");

-- Step 7: Add the invitation-to-teacher relationship.
ALTER TABLE "TeacherInvitation"
ADD CONSTRAINT "TeacherInvitation_teacherId_fkey"
FOREIGN KEY ("teacherId")
REFERENCES "Teacher"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
