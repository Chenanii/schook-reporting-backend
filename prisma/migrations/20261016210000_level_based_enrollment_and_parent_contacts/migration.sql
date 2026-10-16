ALTER TABLE "Enrollment" ADD COLUMN "classLevelId" TEXT;
UPDATE "Enrollment" AS enrollment
SET "classLevelId" = class_group."classLevelId"
FROM "ClassGroup" AS class_group
WHERE enrollment."classGroupId" = class_group."id";
ALTER TABLE "Enrollment" ALTER COLUMN "classLevelId" SET NOT NULL;
ALTER TABLE "Enrollment" ALTER COLUMN "classGroupId" DROP NOT NULL;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classLevelId_fkey"
  FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Enrollment_classLevelId_termId_status_idx"
  ON "Enrollment"("classLevelId", "termId", "status");

ALTER TABLE "Parent" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "Parent" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Parent" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Parent" ADD COLUMN "email" TEXT;
ALTER TABLE "Parent" ADD COLUMN "phone" TEXT;
UPDATE "Parent" AS parent
SET "firstName" = app_user."firstName",
    "lastName" = app_user."lastName",
    "email" = app_user."email"
FROM "User" AS app_user
WHERE parent."userId" = app_user."id";
CREATE UNIQUE INDEX "Parent_schoolId_email_key" ON "Parent"("schoolId", "email");
CREATE INDEX "Parent_schoolId_phone_idx" ON "Parent"("schoolId", "phone");
