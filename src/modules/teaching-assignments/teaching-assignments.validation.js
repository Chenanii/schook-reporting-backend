import { z } from 'zod';

const idSchema = z.string().trim().min(1, 'ID is required.');
const assignmentTypeSchema = z.enum(['CLASS', 'STREAM']);
const streamNameSchema = z.string().trim().min(1).max(30);

export const createTeachingAssignmentSchema = z.object({
  assignmentType: assignmentTypeSchema.optional(),
  teacherId: idSchema,
  classGroupId: idSchema.optional(),
  classLevelId: idSchema.optional(),
  subjectId: idSchema,
  academicYearId: idSchema,
  streamName: streamNameSchema.optional()
}).strict().superRefine((data, ctx) => {
  const classBased = data.assignmentType
    ? data.assignmentType === 'CLASS'
    : Boolean(data.classGroupId);

  if (classBased && !data.classGroupId) {
    ctx.addIssue({
      code: 'custom',
      path: ['classGroupId'],
      message: 'Choose a class group for a class-based assignment.'
    });
  }
  if (!classBased && !data.classLevelId) {
    ctx.addIssue({
      code: 'custom',
      path: ['classLevelId'],
      message: 'Choose a class level for a subject stream assignment.'
    });
  }
});

export const updateTeachingAssignmentSchema = z.object({
  assignmentType: assignmentTypeSchema.optional(),
  teacherId: idSchema.optional(),
  classGroupId: idSchema.optional(),
  classLevelId: idSchema.optional(),
  subjectId: idSchema.optional(),
  academicYearId: idSchema.optional(),
  effectiveFromTermId: idSchema.optional(),
  streamName: streamNameSchema.optional()
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