
import { z } from 'zod';

const enrollmentStatus = z.enum([
  'ACTIVE',
  'COMPLETED',
  'PROMOTED',
  'REPEATING',
  'TRANSFERRED',
  'WITHDRAWN',
  'GRADUATED'
]);

const bulkEnrollmentFields = {
  sourceTermId: z.string().trim().min(1, 'Source term is required.'),
  sourceClassGroupId: z.string().trim().min(1, 'Source class is required.'),
  targetTermId: z.string().trim().min(1, 'Destination term is required.'),
  targetClassGroupId: z.string().trim().min(1, 'Destination class is required.')
};

export const createEnrollmentSchema = z.object({
  studentId: z.string().trim().min(1, 'Student is required.'),
  termId: z.string().trim().min(1, 'Academic term is required.'),
  classGroupId: z.string().trim().min(1, 'Class group is required.'),
  previousEnrollmentId: z.string().trim().min(1).optional()
}).strict();

export const listEnrollmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  termId: z.string().trim().optional(),
  classGroupId: z.string().trim().optional(),
  status: enrollmentStatus.optional(),
  search: z.string().trim().max(100).optional()
});

export const updateEnrollmentStatusSchema = z.object({
  status: enrollmentStatus
}).strict();

export const bulkEnrollmentPreviewSchema = z.object(
  bulkEnrollmentFields
).strict().refine(
  (data) => data.sourceTermId !== data.targetTermId,
  {
    message: 'Source and destination terms must be different.',
    path: ['targetTermId']
  }
);

export const bulkEnrollmentSchema = z.object({
  ...bulkEnrollmentFields,
  confirm: z.literal(true, {
    error: 'Set confirm to true to process bulk enrolment.'
  })
}).strict().refine(
  (data) => data.sourceTermId !== data.targetTermId,
  {
    message: 'Source and destination terms must be different.',
    path: ['targetTermId']
  }
);
