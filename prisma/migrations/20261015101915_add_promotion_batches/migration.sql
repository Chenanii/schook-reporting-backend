-- CreateTable
CREATE TABLE "PromotionBatch" (
    "id" TEXT NOT NULL,
    "sourceTermId" TEXT NOT NULL,
    "destinationTermId" TEXT NOT NULL,
    "classGroupId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "decisions" JSONB NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromotionBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PromotionBatch_sourceTermId_classGroupId_idx" ON "PromotionBatch"("sourceTermId", "classGroupId");

-- CreateIndex
CREATE INDEX "PromotionBatch_destinationTermId_idx" ON "PromotionBatch"("destinationTermId");

-- CreateIndex
CREATE INDEX "PromotionBatch_approvedById_approvedAt_idx" ON "PromotionBatch"("approvedById", "approvedAt");

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_sourceTermId_fkey" FOREIGN KEY ("sourceTermId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_destinationTermId_fkey" FOREIGN KEY ("destinationTermId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_classGroupId_fkey" FOREIGN KEY ("classGroupId") REFERENCES "ClassGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PromotionBatch" ADD CONSTRAINT "PromotionBatch_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
