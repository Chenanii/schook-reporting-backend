
import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID is required.');

export const createTeachingAssignmentSchema = z.object({
  teacherId: idSchema,
  classGroupId: idSchema.optional(),
  classLevelId: idSchema.optional(),
  subjectId: idSchema,
  termId: idSchema,
  streamName: z.string().trim().min(1).max(30).optional()
}).strict().refine(
  (data) => Boolean(data.classGroupId || data.classLevelId),
  { message: 'Choose a class group for a required class subject or a class level for a subject stream.' }
);

export const updateTeachingAssignmentSchema = z.object({
  teacherId: idSchema.optional(),
  classGroupId: idSchema.optional(),
  classLevelId: idSchema.optional(),
  subjectId: idSchema.optional(),
  termId: idSchema.optional(),
  streamName: z.string().trim().min(1).max(30).optional()
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
