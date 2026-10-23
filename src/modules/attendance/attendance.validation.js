import { z } from 'zod';

const idSchema = z.string().trim().min(1);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, 'Date is invalid.');

export const attendanceClassesSchema = z.object({ termId: idSchema, date: dateSchema.optional() }).strict();

export const attendanceSheetQuerySchema = z.object({
  termId: idSchema,
  classGroupId: idSchema,
  date: dateSchema
}).strict();

export const attendanceReportQuerySchema = z.object({
  termId: idSchema,
  classGroupId: idSchema.optional(),
  studentId: idSchema.optional(),
  format: z.enum(['pdf', 'excel']).optional()
}).strict().refine((value) => !(value.classGroupId && value.studentId), {
  message: 'Choose a class group or an individual student.',
  path: ['studentId']
});

export const saveAttendanceSchema = z.object({
  termId: idSchema,
  classGroupId: idSchema,
  date: dateSchema,
  records: z.array(z.object({
    enrollmentId: idSchema,
    status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']),
    note: z.string().trim().max(300).optional().default('')
  }).strict()).min(1).max(500).refine(
    (records) => new Set(records.map(({ enrollmentId }) => enrollmentId)).size === records.length,
    { message: 'Each student can only be marked once.', path: ['records'] }
  )
}).strict();

export const scanAttendanceSchema = z.object({
  termId: idSchema,
  classGroupId: idSchema,
  date: dateSchema,
  code: z.string().trim().min(1).max(100)
}).strict();
