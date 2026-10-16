CREATE TABLE "EnrollmentSubjectStream" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "teachingAssignmentId" TEXT NOT NULL,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "droppedAt" TIMESTAMP(3),
    "schoolId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrollmentSubjectStream_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EnrollmentSubjectStream_enrollmentId_teachingAssignmentId_key"
ON "EnrollmentSubjectStream"("enrollmentId", "teachingAssignmentId");

CREATE INDEX "EnrollmentSubjectStream_teachingAssignmentId_status_idx"
ON "EnrollmentSubjectStream"("teachingAssignmentId", "status");

CREATE INDEX "EnrollmentSubjectStream_schoolId_idx"
ON "EnrollmentSubjectStream"("schoolId");

ALTER TABLE "EnrollmentSubjectStream"
ADD CONSTRAINT "EnrollmentSubjectStream_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentSubjectStream"
ADD CONSTRAINT "EnrollmentSubjectStream_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "EnrollmentSubjectStream"
ADD CONSTRAINT "EnrollmentSubjectStream_teachingAssignmentId_fkey"
FOREIGN KEY ("teachingAssignmentId") REFERENCES "TeachingAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Preserve existing elective participation from assessment results and published term results.
INSERT INTO "EnrollmentSubjectStream" (
    "id", "enrollmentId", "teachingAssignmentId", "status", "schoolId", "createdAt", "updatedAt"
)
SELECT DISTINCT
    'stream_' || md5(enrollment."id" || assignment."id"),
    enrollment."id",
    assignment."id",
    'ACTIVE'::"RecordStatus",
    enrollment."schoolId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Enrollment" enrollment
JOIN "TeachingAssignment" assignment
  ON assignment."termId" = enrollment."termId"
 AND assignment."classGroupId" = enrollment."classGroupId"
 AND assignment."schoolId" = enrollment."schoolId"
JOIN "ClassGroup" class_group ON class_group."id" = enrollment."classGroupId"
WHERE assignment."classSubjectId" IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM "ClassSubject" class_subject
      WHERE class_subject."classLevelId" = class_group."classLevelId"
  )
  AND (
      EXISTS (
          SELECT 1
          FROM "Assessment" assessment
          JOIN "AssessmentResult" result ON result."assessmentId" = assessment."id"
          WHERE assessment."teachingAssignmentId" = assignment."id"
            AND result."enrollmentId" = enrollment."id"
            AND result."status" <> 'NOT_ENTERED'
      )
      OR EXISTS (
          SELECT 1 FROM "TermSubjectResult" result
          WHERE result."enrollmentId" = enrollment."id"
            AND result."subjectId" = assignment."subjectId"
            AND result."status" = 'PUBLISHED'
      )
  )
ON CONFLICT ("enrollmentId", "teachingAssignmentId") DO NOTHING;
