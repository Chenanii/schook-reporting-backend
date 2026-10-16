
import { z } from 'zod';

const dateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value;
}, 'Enter a valid date in YYYY-MM-DD format.');

export const createAcademicYearSchema = z.object({
  name: z.string().trim().min(1).max(50),
  startDate: dateOnly,
  endDate: dateOnly,
  isCurrent: z.boolean().default(false),
  gradeScaleId: z.string().trim().min(1).nullable().optional()
}).refine(
  (data) => data.startDate < data.endDate,
  {
    message: 'The end date must be after the start date.',
    path: ['endDate']
  }
);

export const updateAcademicYearSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  isCurrent: z.boolean().optional(),
  gradeScaleId: z.string().trim().min(1).nullable().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
).refine(
  (data) => !data.startDate || !data.endDate ||
    data.startDate < data.endDate,
  {
    message: 'The end date must be after the start date.',
    path: ['endDate']
  }
);

export const listAcademicYearsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});
