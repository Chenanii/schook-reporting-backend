CREATE TYPE "SchoolStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED', 'PENDING_PAYMENT');
CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

CREATE TABLE "School" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "email" TEXT,
    "status" "SchoolStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubscriptionPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interval" "BillingInterval" NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'MWK',
    "trialDays" INTEGER NOT NULL DEFAULT 14,
    "maxStudents" INTEGER,
    "maxStaff" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SubscriptionPlan_priceMinor_check" CHECK ("priceMinor" >= 0),
    CONSTRAINT "SubscriptionPlan_trialDays_check" CHECK ("trialDays" BETWEEN 0 AND 90)
);

CREATE TABLE "SchoolSubscription" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
    "currentPeriodStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentPeriodEnd" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SchoolSubscription_pkey" PRIMARY KEY ("id")
);

INSERT INTO "School" ("id", "name", "slug", "status", "updatedAt")
VALUES ('legacy-school', 'Legacy School', 'legacy-school', 'ACTIVE', CURRENT_TIMESTAMP);

INSERT INTO "SubscriptionPlan" (
  "id", "code", "name", "description", "interval", "priceMinor", "currency",
  "trialDays", "isActive", "updatedAt"
) VALUES (
  'legacy-plan', 'legacy', 'Migrated school', 'Existing school data carried forward by the SaaS migration.',
  'MONTHLY', 0, 'MWK', 0, false, CURRENT_TIMESTAMP
);

ALTER TABLE "User" ADD COLUMN "schoolId" TEXT;
UPDATE "User" SET "schoolId" = 'legacy-school' WHERE "role" <> 'SUPER_ADMIN';

ALTER TABLE "Teacher" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "TeacherInvitation" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "StudentAccount" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Parent" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "ParentStudent" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Student" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "AcademicYear" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Term" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "GradeScale" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "GradeBoundary" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "ClassLevel" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "ClassGroup" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Subject" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "ClassSubject" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "TeachingAssignment" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "Assessment" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "AssessmentResult" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "TermSubjectResult" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "AnnualSubjectResult" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "AnnualResultTerm" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "schoolId" TEXT;
ALTER TABLE "PromotionBatch" ADD COLUMN "schoolId" TEXT;

UPDATE "Teacher" SET "schoolId" = 'legacy-school';
UPDATE "TeacherInvitation" SET "schoolId" = 'legacy-school';
UPDATE "StudentAccount" SET "schoolId" = 'legacy-school';
UPDATE "Parent" SET "schoolId" = 'legacy-school';
UPDATE "ParentStudent" SET "schoolId" = 'legacy-school';
UPDATE "Student" SET "schoolId" = 'legacy-school';
UPDATE "AcademicYear" SET "schoolId" = 'legacy-school';
UPDATE "Term" SET "schoolId" = 'legacy-school';
UPDATE "GradeScale" SET "schoolId" = 'legacy-school';
UPDATE "GradeBoundary" SET "schoolId" = 'legacy-school';
UPDATE "ClassLevel" SET "schoolId" = 'legacy-school';
UPDATE "ClassGroup" SET "schoolId" = 'legacy-school';
UPDATE "Subject" SET "schoolId" = 'legacy-school';
UPDATE "ClassSubject" SET "schoolId" = 'legacy-school';
UPDATE "TeachingAssignment" SET "schoolId" = 'legacy-school';
UPDATE "Enrollment" SET "schoolId" = 'legacy-school';
UPDATE "Assessment" SET "schoolId" = 'legacy-school';
UPDATE "AssessmentResult" SET "schoolId" = 'legacy-school';
UPDATE "TermSubjectResult" SET "schoolId" = 'legacy-school';
UPDATE "AnnualSubjectResult" SET "schoolId" = 'legacy-school';
UPDATE "AnnualResultTerm" SET "schoolId" = 'legacy-school';
UPDATE "AuditLog" SET "schoolId" = 'legacy-school';
UPDATE "PromotionBatch" SET "schoolId" = 'legacy-school';

ALTER TABLE "Teacher" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TeacherInvitation" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "StudentAccount" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Parent" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ParentStudent" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AcademicYear" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Term" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "GradeScale" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "GradeBoundary" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassLevel" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassGroup" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Subject" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "ClassSubject" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TeachingAssignment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Enrollment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "Assessment" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AssessmentResult" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "TermSubjectResult" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AnnualSubjectResult" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AnnualResultTerm" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "AuditLog" ALTER COLUMN "schoolId" SET NOT NULL;
ALTER TABLE "PromotionBatch" ALTER COLUMN "schoolId" SET NOT NULL;

INSERT INTO "SchoolSubscription" (
  "id", "schoolId", "planId", "status", "currentPeriodStart", "updatedAt"
) VALUES (
  'legacy-subscription', 'legacy-school', 'legacy-plan', 'ACTIVE', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "School_slug_key" ON "School"("slug");
CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX "SubscriptionPlan_isActive_priceMinor_idx" ON "SubscriptionPlan"("isActive", "priceMinor");
CREATE INDEX "SchoolSubscription_schoolId_status_currentPeriodEnd_idx" ON "SchoolSubscription"("schoolId", "status", "currentPeriodEnd");
CREATE INDEX "SchoolSubscription_planId_status_idx" ON "SchoolSubscription"("planId", "status");

DROP INDEX "Teacher_email_key";
DROP INDEX "Teacher_staffNumber_key";
DROP INDEX "Student_admissionNumber_key";
DROP INDEX "AcademicYear_name_key";
DROP INDEX "GradeScale_name_key";
DROP INDEX "ClassLevel_name_key";
DROP INDEX "ClassLevel_levelOrder_key";
DROP INDEX "Subject_code_key";
DROP INDEX "Subject_name_key";

CREATE UNIQUE INDEX "Teacher_schoolId_email_key" ON "Teacher"("schoolId", "email");
CREATE UNIQUE INDEX "Teacher_schoolId_staffNumber_key" ON "Teacher"("schoolId", "staffNumber");
CREATE UNIQUE INDEX "Student_schoolId_admissionNumber_key" ON "Student"("schoolId", "admissionNumber");
CREATE UNIQUE INDEX "AcademicYear_schoolId_name_key" ON "AcademicYear"("schoolId", "name");
CREATE UNIQUE INDEX "GradeScale_schoolId_name_key" ON "GradeScale"("schoolId", "name");
CREATE UNIQUE INDEX "ClassLevel_schoolId_name_key" ON "ClassLevel"("schoolId", "name");
CREATE UNIQUE INDEX "ClassLevel_schoolId_levelOrder_key" ON "ClassLevel"("schoolId", "levelOrder");
CREATE UNIQUE INDEX "Subject_schoolId_code_key" ON "Subject"("schoolId", "code");
CREATE UNIQUE INDEX "Subject_schoolId_name_key" ON "Subject"("schoolId", "name");

CREATE INDEX "User_schoolId_idx" ON "User"("schoolId");
CREATE INDEX "Teacher_schoolId_idx" ON "Teacher"("schoolId");
CREATE INDEX "TeacherInvitation_schoolId_idx" ON "TeacherInvitation"("schoolId");
CREATE INDEX "StudentAccount_schoolId_idx" ON "StudentAccount"("schoolId");
CREATE INDEX "Parent_schoolId_idx" ON "Parent"("schoolId");
CREATE INDEX "ParentStudent_schoolId_idx" ON "ParentStudent"("schoolId");
CREATE INDEX "Student_schoolId_idx" ON "Student"("schoolId");
CREATE INDEX "AcademicYear_schoolId_idx" ON "AcademicYear"("schoolId");
CREATE INDEX "Term_schoolId_idx" ON "Term"("schoolId");
CREATE INDEX "GradeScale_schoolId_idx" ON "GradeScale"("schoolId");
CREATE INDEX "GradeBoundary_schoolId_idx" ON "GradeBoundary"("schoolId");
CREATE INDEX "ClassLevel_schoolId_idx" ON "ClassLevel"("schoolId");
CREATE INDEX "ClassGroup_schoolId_idx" ON "ClassGroup"("schoolId");
CREATE INDEX "Subject_schoolId_idx" ON "Subject"("schoolId");
CREATE INDEX "ClassSubject_schoolId_idx" ON "ClassSubject"("schoolId");
CREATE INDEX "TeachingAssignment_schoolId_idx" ON "TeachingAssignment"("schoolId");
CREATE INDEX "Enrollment_schoolId_idx" ON "Enrollment"("schoolId");
CREATE INDEX "Assessment_schoolId_idx" ON "Assessment"("schoolId");
CREATE INDEX "AssessmentResult_schoolId_idx" ON "AssessmentResult"("schoolId");
CREATE INDEX "TermSubjectResult_schoolId_idx" ON "TermSubjectResult"("schoolId");
CREATE INDEX "AnnualSubjectResult_schoolId_idx" ON "AnnualSubjectResult"("schoolId");
CREATE INDEX "AnnualResultTerm_schoolId_idx" ON "AnnualResultTerm"("schoolId");
CREATE INDEX "AuditLog_schoolId_idx" ON "AuditLog"("schoolId");
CREATE INDEX "PromotionBatch_schoolId_idx" ON "PromotionBatch"("schoolId");

ALTER TABLE "User" ADD CONSTRAINT "User_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Teacher" ADD CONSTRAINT "Teacher_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeacherInvitation" ADD CONSTRAINT "TeacherInvitation_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudentAccount" ADD CONSTRAINT "StudentAccount_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Parent" ADD CONSTRAINT "Parent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ParentStudent" ADD CONSTRAINT "ParentStudent_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Student" ADD CONSTRAINT "Student_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AcademicYear" ADD CONSTRAINT "AcademicYear_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Term" ADD CONSTRAINT "Term_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeScale" ADD CONSTRAINT "GradeScale_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GradeBoundary" ADD CONSTRAINT "GradeBoundary_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassLevel" ADD CONSTRAINT "ClassLevel_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassGroup" ADD CONSTRAINT "ClassGroup_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Subject" ADD CONSTRAINT "Subject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClassSubject" ADD CONSTRAINT "ClassSubject_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssessmentResult" ADD CONSTRAINT "AssessmentResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TermSubjectResult" ADD CONSTRAINT "TermSubjectResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualSubjectResult" ADD CONSTRAINT "AnnualSubjectResult_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnnualResultTerm" ADD CONSTRAINT "AnnualResultTerm_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SchoolSubscription" ADD CONSTRAINT "SchoolSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
