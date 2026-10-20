CREATE TYPE "ReportPublicationType" AS ENUM ('MID_TERM', 'END_OF_TERM');
ALTER TYPE "NotificationType" ADD VALUE 'MID_TERM_REPORT_PUBLISHED';

CREATE TABLE "ReportPublication" (
    "id" TEXT NOT NULL,
    "type" "ReportPublicationType" NOT NULL,
    "termId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "publishedById" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportPublication_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportPublication_termId_classGroupId_type_key"
ON "ReportPublication"("termId", "classGroupId", "type");

CREATE INDEX "ReportPublication_schoolId_type_publishedAt_idx"
ON "ReportPublication"("schoolId", "type", "publishedAt");

ALTER TABLE "ReportPublication" ADD CONSTRAINT "ReportPublication_termId_fkey"
FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportPublication" ADD CONSTRAINT "ReportPublication_classGroupId_fkey"
FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportPublication" ADD CONSTRAINT "ReportPublication_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ReportPublication" ADD CONSTRAINT "ReportPublication_publishedById_fkey"
FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
