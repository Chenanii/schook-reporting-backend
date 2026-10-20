DROP INDEX IF EXISTS "Parent_schoolId_email_key";
CREATE INDEX "Parent_schoolId_email_idx" ON "Parent"("schoolId", "email");
