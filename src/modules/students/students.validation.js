
import { z } from 'zod';

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
const parentContact = z.object({
  parentId: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(5).max(30).optional().or(z.literal('')),
  email: z.string().trim().email().transform((value) => value.toLowerCase()).optional().or(z.literal('')),
  relationship: z.string().trim().max(40).optional()
}).strict();
const registrationParentContact = parentContact
  .omit({ parentId: true })
  .extend({ phone: z.string().trim().min(5).max(30) });

export const createStudentSchema = z.object({
  termId: z.string().trim().min(1, 'Academic term is required.'),
  classLevelId: z.string().trim().min(1, 'Class level is required.'),
  firstName,
  middleName: middleName.optional(),
  lastName,
  dateOfBirth: dateOfBirth.nullable().optional(),
  gender: gender.nullable().optional(),
  status: studentStatus.optional(),
  parents: z.array(registrationParentContact).min(1, 'Add at least one parent or guardian.').max(5)
}).strict();

export const updateStudentSchema = z.object({
  firstName: firstName.optional(),
  middleName: middleName.optional(),
  lastName: lastName.optional(),
  dateOfBirth: dateOfBirth.nullable().optional(),
  gender: gender.nullable().optional(),
  parents: z.array(parentContact).max(5).refine(
    (parents) => parents.every(({ phone, email }) => Boolean(phone || email)),
    { message: 'Provide a phone number or email address for each parent or guardian.' }
  ).optional()
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
  status: studentStatus.optional(),
  excludeEnrolledTermId: z.string().trim().min(1).optional()
});
