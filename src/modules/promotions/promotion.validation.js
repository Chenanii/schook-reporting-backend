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
      overrideReason: z.string().trim().min(1).max(500).optional(),
    }),
  ).min(1),
});

export const promotionPolicySchema = z.object({
  minimumAverage: z.number().min(0).max(100),
  passMark: z.number().min(0).max(100),
  minimumSubjectsPassed: z.number().int().min(0).max(100),
  requiredSubjectIds: z.array(z.string().trim().min(1)).max(100).refine((ids) => new Set(ids).size === ids.length, 'Required subjects must be unique.'),
}).strict();
