
import { z } from 'zod';

const subjectCode = z
  .string()
  .trim()
  .min(1, 'Subject code is required.')
  .max(20, 'Subject code must not exceed 20 characters.')
  .transform((value) => value.toUpperCase());

const subjectName = z
  .string()
  .trim()
  .min(1, 'Subject name is required.')
  .max(100, 'Subject name must not exceed 100 characters.');

const subjectStatus = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const createSubjectSchema = z.object({
  code: subjectCode,
  name: subjectName,
  status: subjectStatus.optional()
}).strict();

export const updateSubjectSchema = z.object({
  code: subjectCode.optional(),
  name: subjectName.optional(),
  status: subjectStatus.optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const listSubjectsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: subjectStatus.optional()
});
