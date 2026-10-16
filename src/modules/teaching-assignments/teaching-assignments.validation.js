
import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID is required.');

export const createTeachingAssignmentSchema = z.object({
  teacherId: idSchema,
  classGroupId: idSchema,
  subjectId: idSchema,
  termId: idSchema
}).strict();

export const updateTeachingAssignmentSchema = z.object({
  teacherId: idSchema.optional(),
  classGroupId: idSchema.optional(),
  subjectId: idSchema.optional(),
  termId: idSchema.optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const listTeachingAssignmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  teacherId: idSchema.optional(),
  classGroupId: idSchema.optional(),
  subjectId: idSchema.optional(),
  termId: idSchema.optional()
});

export const teachingAssignmentIdSchema = z.object({
  id: idSchema
});
