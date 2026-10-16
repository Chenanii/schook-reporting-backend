CREATE TABLE "SubjectStream" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "termId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubjectStream_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "TeachingAssignment" ADD COLUMN "subjectStreamId" TEXT;
ALTER TABLE "EnrollmentSubjectStream" ADD COLUMN "subjectStreamId" TEXT;

INSERT INTO "SubjectStream" ("id", "name", "classGroupId", "subjectId", "termId", "schoolId", "createdAt", "updatedAt")
SELECT DISTINCT ON (assignment."classGroupId", assignment."termId", assignment."subjectId")
    'stream_' || assignment."id",
    subject."name",
    assignment."classGroupId",
    assignment."subjectId",
    assignment."termId",
    assignment."schoolId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "TeachingAssignment" assignment
JOIN "Subject" subject ON subject."id" = assignment."subjectId"
WHERE assignment."classSubjectId" IS NULL
ORDER BY assignment."classGroupId", assignment."termId", assignment."subjectId", assignment."createdAt";

UPDATE "TeachingAssignment" assignment
SET "subjectStreamId" = stream."id"
FROM "SubjectStream" stream
WHERE stream."classGroupId" = assignment."classGroupId"
  AND stream."termId" = assignment."termId"
  AND stream."subjectId" = assignment."subjectId"
  AND assignment."classSubjectId" IS NULL;

UPDATE "EnrollmentSubjectStream" selection
SET "subjectStreamId" = assignment."subjectStreamId"
FROM "TeachingAssignment" assignment
WHERE assignment."id" = selection."teachingAssignmentId";

DELETE FROM "EnrollmentSubjectStream" selection
USING (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "enrollmentId", "subjectStreamId"
        ORDER BY CASE WHEN "status" = 'ACTIVE' THEN 0 ELSE 1 END, "createdAt", "id"
    ) AS duplicate_rank
    FROM "EnrollmentSubjectStream"
) ranked
WHERE selection."id" = ranked."id" AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX "SubjectStream_classGroupId_termId_subjectId_key" ON "SubjectStream"("classGroupId", "termId", "subjectId");
CREATE INDEX "SubjectStream_classGroupId_termId_idx" ON "SubjectStream"("classGroupId", "termId");
CREATE INDEX "SubjectStream_subjectId_termId_idx" ON "SubjectStream"("subjectId", "termId");
CREATE INDEX "SubjectStream_schoolId_idx" ON "SubjectStream"("schoolId");
CREATE INDEX "TeachingAssignment_subjectStreamId_idx" ON "TeachingAssignment"("subjectStreamId");
DROP INDEX "EnrollmentSubjectStream_enrollmentId_teachingAssignmentId_key";
DROP INDEX "EnrollmentSubjectStream_teachingAssignmentId_status_idx";
ALTER TABLE "EnrollmentSubjectStream" DROP CONSTRAINT "EnrollmentSubjectStream_teachingAssignmentId_fkey";
ALTER TABLE "EnrollmentSubjectStream" ALTER COLUMN "subjectStreamId" SET NOT NULL;
CREATE UNIQUE INDEX "EnrollmentSubjectStream_enrollmentId_subjectStreamId_key" ON "EnrollmentSubjectStream"("enrollmentId", "subjectStreamId");
CREATE INDEX "EnrollmentSubjectStream_subjectStreamId_status_idx" ON "EnrollmentSubjectStream"("subjectStreamId", "status");

ALTER TABLE "SubjectStream" ADD CONSTRAINT "SubjectStream_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectStream" ADD CONSTRAINT "SubjectStream_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectStream" ADD CONSTRAINT "SubjectStream_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SubjectStream" ADD CONSTRAINT "SubjectStream_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_subjectStreamId_fkey" FOREIGN KEY ("subjectStreamId") REFERENCES "SubjectStream"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentSubjectStream" ADD CONSTRAINT "EnrollmentSubjectStream_subjectStreamId_fkey" FOREIGN KEY ("subjectStreamId") REFERENCES "SubjectStream"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EnrollmentSubjectStream" DROP COLUMN "teachingAssignmentId";
