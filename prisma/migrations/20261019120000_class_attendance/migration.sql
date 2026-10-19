CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

CREATE TABLE "FormTutorAssignment" (
  "id" TEXT NOT NULL,
  "teacherId" TEXT NOT NULL,
  "classGroupId" TEXT NOT NULL,
  "academicYearId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FormTutorAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceSession" (
  "id" TEXT NOT NULL,
  "classGroupId" TEXT NOT NULL,
  "termId" TEXT NOT NULL,
  "date" DATE NOT NULL,
  "takenById" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AttendanceRecord" (
  "id" TEXT NOT NULL,
  "attendanceSessionId" TEXT NOT NULL,
  "enrollmentId" TEXT NOT NULL,
  "status" "AttendanceStatus" NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FormTutorAssignment_classGroupId_academicYearId_key" ON "FormTutorAssignment"("classGroupId", "academicYearId");
CREATE INDEX "FormTutorAssignment_teacherId_academicYearId_idx" ON "FormTutorAssignment"("teacherId", "academicYearId");
CREATE INDEX "FormTutorAssignment_schoolId_idx" ON "FormTutorAssignment"("schoolId");
CREATE UNIQUE INDEX "AttendanceSession_classGroupId_termId_date_key" ON "AttendanceSession"("classGroupId", "termId", "date");
CREATE INDEX "AttendanceSession_termId_date_idx" ON "AttendanceSession"("termId", "date");
CREATE INDEX "AttendanceSession_schoolId_idx" ON "AttendanceSession"("schoolId");
CREATE UNIQUE INDEX "AttendanceRecord_attendanceSessionId_enrollmentId_key" ON "AttendanceRecord"("attendanceSessionId", "enrollmentId");
CREATE INDEX "AttendanceRecord_enrollmentId_idx" ON "AttendanceRecord"("enrollmentId");

ALTER TABLE "FormTutorAssignment" ADD CONSTRAINT "FormTutorAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormTutorAssignment" ADD CONSTRAINT "FormTutorAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormTutorAssignment" ADD CONSTRAINT "FormTutorAssignment_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "FormTutorAssignment" ADD CONSTRAINT "FormTutorAssignment_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "AcademicYear"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceSession" ADD CONSTRAINT "AttendanceSession_takenById_fkey" FOREIGN KEY ("takenById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_attendanceSessionId_fkey" FOREIGN KEY ("attendanceSessionId") REFERENCES "AttendanceSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
