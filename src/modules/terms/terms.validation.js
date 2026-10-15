import { z } from 'zod';

const dateOnly = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}, 'Enter a valid date in YYYY-MM-DD format.');

const termStatus = z.enum([
  'DRAFT',
  'OPEN',
  'MARKS_REVIEW',
  'FINALIZED',
  'PUBLISHED',
  'CLOSED'
]);

const annualWeight = z.number().min(0).max(100);

export const createTermSchema = z.object({
  name: z.string().trim().min(1).max(50),
  sequence: z.number().int().min(1).max(3),
  academicYearId: z.string().min(1),
  startDate: dateOnly,
  endDate: dateOnly,
  annualWeightPercent: annualWeight.optional()
}).refine(
  (data) => data.startDate < data.endDate,
  {
    message: 'The end date must be after the start date.',
    path: ['endDate']
  }
);

export const updateTermSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  sequence: z.number().int().min(1).max(3).optional(),
  startDate: dateOnly.optional(),
  endDate: dateOnly.optional(),
  annualWeightPercent: annualWeight.nullable().optional()
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Provide at least one field to update.' }
).refine(
  (data) =>
    !data.startDate ||
    !data.endDate ||
    data.startDate < data.endDate,
  {
    message: 'The end date must be after the start date.',
    path: ['endDate']
  }
);

export const listTermsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  academicYearId: z.string().min(1).optional(),
  status: termStatus.optional()
});

export const updateTermStatusSchema = z.object({
  status: termStatus
});