CREATE TABLE "ReportCardDetails" (
  "id" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "reportType" "ReportPublicationType" NOT NULL,
  "behaviorComments" JSONB NOT NULL DEFAULT '{}',
  "coCurricularComments" JSONB NOT NULL DEFAULT '{}',
  "promotedTo" TEXT,
  "promotionRemarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ReportCardDetails_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReportCardDetails_enrollmentId_reportType_key"
ON "ReportCardDetails"("enrollmentId", "reportType");

CREATE INDEX "ReportCardDetails_schoolId_reportType_idx"
ON "ReportCardDetails"("schoolId", "reportType");

ALTER TABLE "ReportCardDetails"
ADD CONSTRAINT "ReportCardDetails_enrollmentId_fkey"
FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReportCardDetails"
ADD CONSTRAINT "ReportCardDetails_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
