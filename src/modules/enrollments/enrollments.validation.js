
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
  classLevelId: z.string().trim().min(1, 'Class level is required.'),
  classGroupId: z.string().trim().min(1).optional(),
  previousEnrollmentId: z.string().trim().min(1).optional()
}).strict();

export const listEnrollmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  studentId: z.string().trim().optional(),
  termId: z.string().trim().optional(),
  classGroupId: z.string().trim().optional(),
  classLevelId: z.string().trim().optional(),
  unassigned: z.enum(['true', 'false']).transform((value) => value === 'true').optional().default(false),
  status: enrollmentStatus.optional(),
  search: z.string().trim().max(100).optional()
});

export const updateEnrollmentStatusSchema = z.object({
  status: enrollmentStatus
}).strict();

export const updateEnrollmentClassGroupSchema = z.object({
  classGroupId: z.string().trim().min(1, 'Class group is required.'),
}).strict();

export const assignClassGroupBulkSchema = z.object({
  termId: z.string().trim().min(1, 'Academic term is required.'),
  classGroupId: z.string().trim().min(1, 'Class group is required.'),
  enrollmentIds: z.array(z.string().trim().min(1)).min(1).max(500)
}).strict().refine(
  ({ enrollmentIds }) => new Set(enrollmentIds).size === enrollmentIds.length,
  { message: 'An enrollment can only be selected once.', path: ['enrollmentIds'] }
);

export const bulkEnrollmentPreviewSchema = z.object(
  bulkEnrollmentFields
).strict().refine(
  (data) => data.sourceTermId !== data.targetTermId,
  {
    message: 'Source and destination terms must be different.',
    path: ['targetTermId']
  }
);

export const selectedBulkEnrollmentSchema = z.object({
  targetTermId: z.string().trim().min(1, 'Destination term is required.'),
  targetClassGroupId: z.string().trim().min(1, 'Destination class is required.'),
  studentIds: z.array(z.string().trim().min(1)).min(1).max(500).refine(
    (ids) => new Set(ids).size === ids.length,
    { message: 'A student can only be selected once.' },
  ),
}).strict();

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
