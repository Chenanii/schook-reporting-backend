ALTER TABLE "AcademicYear" DROP CONSTRAINT "AcademicYear_gradeScaleId_fkey";
ALTER TABLE "AcademicYear" DROP COLUMN "gradeScaleId";

ALTER TABLE "ClassLevel" ADD COLUMN "gradeScaleId" TEXT;

CREATE INDEX "ClassLevel_gradeScaleId_idx" ON "ClassLevel"("gradeScaleId");

ALTER TABLE "ClassLevel"
ADD CONSTRAINT "ClassLevel_gradeScaleId_fkey"
FOREIGN KEY ("gradeScaleId") REFERENCES "GradeScale"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
