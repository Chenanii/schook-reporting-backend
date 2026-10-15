
import { z } from 'zod';

const admissionNumber = z
  .string()
  .trim()
  .min(1, 'Admission number is required.')
  .max(50, 'Admission number must not exceed 50 characters.')
  .transform((value) => value.toUpperCase());

const firstName = z
  .string()
  .trim()
  .min(1, 'First name is required.')
  .max(100, 'First name must not exceed 100 characters.');

const middleName = z
  .string()
  .trim()
  .max(100, 'Middle name must not exceed 100 characters.')
  .nullable();

const lastName = z
  .string()
  .trim()
  .min(1, 'Last name is required.')
  .max(100, 'Last name must not exceed 100 characters.');

const dateOfBirth = z
  .iso
  .date('Date of birth must use YYYY-MM-DD format.');

const gender = z
  .string()
  .trim()
  .max(30, 'Gender must not exceed 30 characters.');

const studentStatus = z.enum(['ACTIVE', 'INACTIVE', 'ARCHIVED']);

export const createStudentSchema = z.object({
  admissionNumber,
  firstName,
  middleName: middleName.optional(),
  lastName,
  dateOfBirth: dateOfBirth.nullable().optional(),
  gender: gender.nullable().optional(),
  status: studentStatus.optional()
}).strict();

export const updateStudentSchema = z.object({
  admissionNumber: admissionNumber.optional(),
  firstName: firstName.optional(),
  middleName: middleName.optional(),
  lastName: lastName.optional(),
  dateOfBirth: dateOfBirth.nullable().optional(),
  gender: gender.nullable().optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const updateStudentStatusSchema = z.object({
  status: studentStatus
}).strict();

export const listStudentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: studentStatus.optional()
});
