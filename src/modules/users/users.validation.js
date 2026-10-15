
import { z } from 'zod';

const staffRoles = [
  'SCHOOL_ADMIN',
  'HEADTEACHER',
  'ACADEMIC_ADMIN',
  'EXAMS_OFFICER',
  'TEACHER',
  'FORM_TUTOR'
];

export const createStaffSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  role: z.enum(staffRoles),
  password: z.string().min(12).max(128),
  staffNumber: z.string().trim().min(1).max(30).optional()
});

export const updateStaffSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  role: z.enum(staffRoles).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
  staffNumber: z.string().trim().min(1).max(30).nullable().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const listStaffSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.enum(staffRoles).optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional()
});
