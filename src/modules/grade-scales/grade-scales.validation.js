import { z } from 'zod';

const boundarySchema = z.object({
  grade: z.string().trim().min(1).max(12),
  minScore: z.number().min(0).max(100),
  description: z.string().trim().max(120).nullable().optional(),
}).strict();

export const createGradeScaleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(250).nullable().optional(),
  maxScore: z.union([z.literal(50), z.literal(100)]).default(100),
  boundaries: z.array(boundarySchema).min(2).max(20),
}).strict().refine((data) => data.boundaries.every((boundary) => boundary.minScore <= data.maxScore), {
  message: 'Grade boundaries cannot exceed the scale maximum.',
  path: ['boundaries'],
}).refine((data) => data.boundaries.some((boundary) => boundary.minScore === 0), {
  message: 'Add a grade boundary starting at 0 so every mark can receive a grade.',
  path: ['boundaries'],
}).refine((data) => new Set(data.boundaries.map((boundary) => boundary.grade)).size === data.boundaries.length, {
  message: 'Grade labels must be unique.',
  path: ['boundaries'],
}).refine((data) => new Set(data.boundaries.map((boundary) => boundary.minScore)).size === data.boundaries.length, {
  message: 'Minimum scores must be unique.',
  path: ['boundaries'],
});
