
import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID is required.');

export const createClassSubjectSchema = z.object({
  classLevelId: idSchema,
  subjectId: idSchema
}).strict();

export const listClassSubjectsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  classLevelId: idSchema.optional(),
  subjectId: idSchema.optional(),
  search: z.string().trim().max(100).optional()
});

export const classSubjectIdSchema = z.object({
  id: idSchema
});
