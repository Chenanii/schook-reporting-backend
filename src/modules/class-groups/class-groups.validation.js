
import { z } from 'zod';

const groupName = z
  .string()
  .trim()
  .min(1, 'Class group name is required.')
  .max(50, 'Class group name must not exceed 50 characters.');

const classLevelId = z
  .string()
  .trim()
  .min(1, 'Class level is required.');

export const createClassGroupSchema = z.object({
  name: groupName,
  classLevelId
}).strict();

export const updateClassGroupSchema = z.object({
  name: groupName.optional(),
  classLevelId: classLevelId.optional()
}).strict().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
);

export const listClassGroupsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  classLevelId: z.string().trim().min(1).optional()
});
