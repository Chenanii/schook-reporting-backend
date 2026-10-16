ALTER TABLE "SubjectStream" ADD COLUMN "classLevelId" TEXT;

UPDATE "SubjectStream" stream
SET "classLevelId" = group_row."classLevelId"
FROM "ClassGroup" group_row
WHERE stream."classGroupId" = group_row."id";

CREATE TEMP TABLE "_SubjectStreamMergeMap" ON COMMIT PRESERVE ROWS AS
SELECT stream."id" AS "oldId",
       FIRST_VALUE(stream."id") OVER (
         PARTITION BY stream."classLevelId", stream."termId", stream."subjectId"
         ORDER BY stream."createdAt", stream."id"
       ) AS "keepId"
FROM "SubjectStream" stream;

DELETE FROM "EnrollmentSubjectStream" selection
USING (
  SELECT selection_row."id",
         ROW_NUMBER() OVER (
           PARTITION BY selection_row."enrollmentId", mapping."keepId"
           ORDER BY CASE WHEN selection_row."status" = 'ACTIVE' THEN 0 ELSE 1 END,
                    selection_row."createdAt", selection_row."id"
         ) AS duplicate_rank
  FROM "EnrollmentSubjectStream" selection_row
  JOIN "_SubjectStreamMergeMap" mapping ON mapping."oldId" = selection_row."subjectStreamId"
) ranked
WHERE selection."id" = ranked."id" AND ranked.duplicate_rank > 1;

UPDATE "EnrollmentSubjectStream" selection
SET "subjectStreamId" = mapping."keepId"
FROM "_SubjectStreamMergeMap" mapping
WHERE selection."subjectStreamId" = mapping."oldId"
  AND mapping."oldId" <> mapping."keepId";

UPDATE "TeachingAssignment" assignment
SET "subjectStreamId" = mapping."keepId"
FROM "_SubjectStreamMergeMap" mapping
WHERE assignment."subjectStreamId" = mapping."oldId"
  AND mapping."oldId" <> mapping."keepId";

DELETE FROM "SubjectStream" stream
USING "_SubjectStreamMergeMap" mapping
WHERE stream."id" = mapping."oldId"
  AND mapping."oldId" <> mapping."keepId";

DROP TABLE "_SubjectStreamMergeMap";
DROP INDEX "SubjectStream_classGroupId_termId_subjectId_key";
DROP INDEX "SubjectStream_classGroupId_termId_idx";
ALTER TABLE "SubjectStream" DROP CONSTRAINT "SubjectStream_classGroupId_fkey";
ALTER TABLE "SubjectStream" DROP COLUMN "classGroupId";
ALTER TABLE "SubjectStream" ALTER COLUMN "classLevelId" SET NOT NULL;

CREATE UNIQUE INDEX "SubjectStream_classLevelId_termId_subjectId_key" ON "SubjectStream"("classLevelId", "termId", "subjectId");
CREATE INDEX "SubjectStream_classLevelId_termId_idx" ON "SubjectStream"("classLevelId", "termId");
ALTER TABLE "SubjectStream" ADD CONSTRAINT "SubjectStream_classLevelId_fkey" FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
