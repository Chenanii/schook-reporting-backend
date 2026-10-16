-- Existing elective assignments become the first section of their subject stream.
UPDATE "SubjectStream" SET "name" = 'A';

DROP INDEX "SubjectStream_classLevelId_termId_subjectId_key";
CREATE UNIQUE INDEX "SubjectStream_classLevelId_termId_subjectId_name_key"
ON "SubjectStream"("classLevelId", "termId", "subjectId", "name");

DROP INDEX "TeachingAssignment_teacherId_classGroupId_subjectId_termId_key";
CREATE UNIQUE INDEX "TeachingAssignment_teacherId_classGroupId_subjectId_termId_regular_key"
ON "TeachingAssignment"("teacherId", "classGroupId", "subjectId", "termId")
WHERE "subjectStreamId" IS NULL;
CREATE INDEX "TeachingAssignment_subjectStreamId_termId_idx"
ON "TeachingAssignment"("subjectStreamId", "termId");
