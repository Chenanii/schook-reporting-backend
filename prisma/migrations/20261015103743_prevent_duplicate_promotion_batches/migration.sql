/*
  Warnings:

  - A unique constraint covering the columns `[sourceTermId,classGroupId]` on the table `PromotionBatch` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "PromotionBatch_sourceTermId_classGroupId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "PromotionBatch_sourceTermId_classGroupId_key" ON "PromotionBatch"("sourceTermId", "classGroupId");
