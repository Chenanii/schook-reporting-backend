import { z } from 'zod';

const scopeSchema = z.object({
  sourceTermId: z.string().trim().min(1),
  destinationTermId: z.string().trim().min(1),
  classGroupId: z.string().trim().min(1),
});

export const previewPromotionSchema = scopeSchema;

export const approvePromotionSchema = scopeSchema.extend({
  decisions: z.array(
    z.object({
      enrollmentId: z.string().trim().min(1),
      outcome: z.enum(['PROMOTE', 'REPEAT', 'GRADUATE']),
      destinationClassGroupId: z.string().trim().min(1).optional(),
    }),
  ).min(1),
});