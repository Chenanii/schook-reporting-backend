WITH annual_scopes AS (
    SELECT DISTINCT
        stream."classLevelId",
        assignment."subjectId",
        stream."name",
        assignment."schoolId",
        term."academicYearId"
    FROM "TeachingAssignment" assignment
    JOIN "Term" term ON term."id" = assignment."termId"
    JOIN "SubjectStream" stream ON stream."id" = assignment."subjectStreamId"
    WHERE (
        SELECT COUNT(*)
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
    ) = 3
      AND (
        SELECT MIN(year_term."sequence")
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
      ) = 1
      AND (
        SELECT MAX(year_term."sequence")
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
      ) = 3
)
INSERT INTO "SubjectStream" (
    "id",
    "name",
    "classLevelId",
    "subjectId",
    "termId",
    "schoolId",
    "createdAt",
    "updatedAt"
)
SELECT
    'annual_stream_' || md5(random()::text || clock_timestamp()::text || scope."classLevelId" || target_term."id"),
    scope."name",
    scope."classLevelId",
    scope."subjectId",
    target_term."id",
    scope."schoolId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM annual_scopes scope
JOIN "Term" target_term
  ON target_term."academicYearId" = scope."academicYearId"
 AND target_term."sequence" BETWEEN 1 AND 3
WHERE NOT EXISTS (
    SELECT 1
    FROM "SubjectStream" existing_stream
    WHERE existing_stream."classLevelId" = scope."classLevelId"
      AND existing_stream."subjectId" = scope."subjectId"
      AND existing_stream."name" = scope."name"
      AND existing_stream."termId" = target_term."id"
);

WITH duplicate_assignments AS (
    SELECT
        assignment."id",
        FIRST_VALUE(assignment."id") OVER (
            PARTITION BY assignment."subjectStreamId"
            ORDER BY assignment."createdAt", assignment."id"
        ) AS "keepId",
        ROW_NUMBER() OVER (
            PARTITION BY assignment."subjectStreamId"
            ORDER BY assignment."createdAt", assignment."id"
        ) AS "rowNumber"
    FROM "TeachingAssignment" assignment
    WHERE assignment."subjectStreamId" IS NOT NULL
)
UPDATE "Assessment" assessment
SET "teachingAssignmentId" = duplicates."keepId"
FROM duplicate_assignments duplicates
WHERE assessment."teachingAssignmentId" = duplicates."id"
  AND duplicates."rowNumber" > 1;

WITH duplicate_assignments AS (
    SELECT
        assignment."id",
        ROW_NUMBER() OVER (
            PARTITION BY assignment."subjectStreamId"
            ORDER BY assignment."createdAt", assignment."id"
        ) AS "rowNumber"
    FROM "TeachingAssignment" assignment
    WHERE assignment."subjectStreamId" IS NOT NULL
)
DELETE FROM "TeachingAssignment" assignment
USING duplicate_assignments duplicates
WHERE assignment."id" = duplicates."id"
  AND duplicates."rowNumber" > 1;

UPDATE "TeachingAssignment" SET "classGroupId" = NULL WHERE "classGroupId" IS NOT NULL;

WITH ranked_assignments AS (
    SELECT
        assignment."teacherId",
        assignment."classGroupId",
        assignment."subjectId",
        assignment."classSubjectId",
        assignment."schoolId",
        stream."classLevelId",
        stream."name",
        term."academicYearId",
        ROW_NUMBER() OVER (
            PARTITION BY term."academicYearId", assignment."schoolId", stream."classLevelId", assignment."subjectId", stream."name"
            ORDER BY term."sequence", assignment."createdAt", assignment."id"
        ) AS "rowNumber"
    FROM "TeachingAssignment" assignment
    JOIN "Term" term ON term."id" = assignment."termId"
    JOIN "SubjectStream" stream ON stream."id" = assignment."subjectStreamId"
    WHERE (
        SELECT COUNT(*)
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
    ) = 3
      AND (
        SELECT MIN(year_term."sequence")
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
      ) = 1
      AND (
        SELECT MAX(year_term."sequence")
        FROM "Term" year_term
        WHERE year_term."academicYearId" = term."academicYearId"
      ) = 3
),
annual_scopes AS (
    SELECT *
    FROM ranked_assignments
    WHERE "rowNumber" = 1
)
INSERT INTO "TeachingAssignment" (
    "id",
    "teacherId",
    "classGroupId",
    "subjectId",
    "classSubjectId",
    "subjectStreamId",
    "termId",
    "schoolId",
    "createdAt",
    "updatedAt"
)
SELECT
    'annual_assignment_' || md5(random()::text || clock_timestamp()::text || scope."classLevelId" || target_term."id"),
    scope."teacherId",
    scope."classGroupId",
    scope."subjectId",
    scope."classSubjectId",
    target_stream."id",
    target_term."id",
    scope."schoolId",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM annual_scopes scope
JOIN "Term" target_term
  ON target_term."academicYearId" = scope."academicYearId"
 AND target_term."sequence" BETWEEN 1 AND 3
JOIN "SubjectStream" target_stream
  ON target_stream."classLevelId" = scope."classLevelId"
 AND target_stream."subjectId" = scope."subjectId"
 AND target_stream."name" = scope."name"
 AND target_stream."termId" = target_term."id"
WHERE NOT EXISTS (
    SELECT 1
    FROM "TeachingAssignment" existing_assignment
    WHERE existing_assignment."subjectStreamId" = target_stream."id"
);
