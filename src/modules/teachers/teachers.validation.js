
import { z } from 'zod';

const staffNumberSchema = z.string()
  .trim()
  .min(1, 'Staff number cannot be empty.')
  .max(50, 'Staff number cannot exceed 50 characters.');

export const createTeacherSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254).transform((v) => v.toLowerCase()),
  staffNumber: staffNumberSchema.optional(),
}).strict();

export const updateTeacherSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  staffNumber: staffNumberSchema.nullable().optional(),
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const listTeachersSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const acceptTeacherInvitationSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/i, 'Invalid invitation token.'),
  password: z.string().min(12, 'Password must be at least 12 characters.').max(128),
}).strict();
