CREATE TABLE "PromotionPolicy" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "classLevelId" TEXT NOT NULL,
    "minimumAverage" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "passMark" DECIMAL(5,2) NOT NULL DEFAULT 50,
    "minimumSubjectsPassed" INTEGER NOT NULL DEFAULT 0,
    "requiredSubjectIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionPolicy_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PromotionPolicy_schoolId_classLevelId_key"
ON "PromotionPolicy"("schoolId", "classLevelId");
CREATE INDEX "PromotionPolicy_schoolId_idx" ON "PromotionPolicy"("schoolId");

ALTER TABLE "PromotionPolicy" ADD CONSTRAINT "PromotionPolicy_schoolId_fkey"
FOREIGN KEY ("schoolId") REFERENCES "School"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PromotionPolicy" ADD CONSTRAINT "PromotionPolicy_classLevelId_fkey"
FOREIGN KEY ("classLevelId") REFERENCES "ClassLevel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
