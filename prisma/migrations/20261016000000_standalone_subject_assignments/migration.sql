ALTER TABLE "TeachingAssignment" ADD COLUMN "subjectId" TEXT;

UPDATE "TeachingAssignment" AS assignment
SET "subjectId" = class_subject."subjectId"
FROM "ClassSubject" AS class_subject
WHERE assignment."classSubjectId" = class_subject."id";

ALTER TABLE "TeachingAssignment" ALTER COLUMN "subjectId" SET NOT NULL;

DROP INDEX "TeachingAssignment_teacherId_classGroupId_classSubjectId_te_key";

ALTER TABLE "TeachingAssignment"
ADD CONSTRAINT "TeachingAssignment_subjectId_fkey"
FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "TeachingAssignment_teacherId_classGroupId_subjectId_termId_key"
ON "TeachingAssignment"("teacherId", "classGroupId", "subjectId", "termId");

CREATE INDEX "TeachingAssignment_subjectId_termId_idx"
ON "TeachingAssignment"("subjectId", "termId");
