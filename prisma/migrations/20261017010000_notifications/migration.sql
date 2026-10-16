CREATE TYPE "NotificationType" AS ENUM (
  'ASSESSMENT_OPENED',
  'ASSESSMENT_SUBMITTED',
  'TERM_RESULT_PUBLISHED'
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "schoolId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" VARCHAR(500) NOT NULL,
  "entityId" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Notification_schoolId_fkey" FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "Notification_userId_schoolId_readAt_createdAt_idx"
  ON "Notification"("userId", "schoolId", "readAt", "createdAt");
CREATE INDEX "Notification_schoolId_createdAt_idx"
  ON "Notification"("schoolId", "createdAt");
