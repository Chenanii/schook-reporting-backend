import { z } from 'zod';

const classLevelName = z
  .string()
  .trim()
  .min(1, 'Class level name is required.')
  .max(50, 'Class level name must not exceed 50 characters.');

const levelOrder = z
  .number()
  .int('Level order must be a whole number.')
  .min(1, 'Level order must be at least 1.')
  .max(100, 'Level order must not exceed 100.');

export const createClassLevelSchema = z
  .object({
    name: classLevelName,
    levelOrder,
    nextLevelId: z.string().trim().min(1).nullable().optional()
  })
  .strict();

export const updateClassLevelSchema = z
  .object({
    name: classLevelName.optional(),
    levelOrder: levelOrder.optional(),
    nextLevelId: z.string().trim().min(1).nullable().optional()
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update.'
  });

export const listClassLevelsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional()
});