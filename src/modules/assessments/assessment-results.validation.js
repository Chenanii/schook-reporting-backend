import { z } from 'zod';

const resultSchema = z.object({
  enrollmentId: z.string().trim().min(1),
  status: z.enum([
    'PRESENT',
    'ABSENT',
    'EXEMPT',
    'NOT_ENTERED',
  ]),
  mark: z.coerce.number().min(0).max(100).nullable().optional(),
  teacherComment: z.string().trim().max(1000).nullable().optional(),
}).superRefine((result, ctx) => {
  if (result.status === 'PRESENT') {
    if (result.mark === undefined || result.mark === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['mark'],
        message: 'A mark is required when the student is PRESENT.',
      });
    }
  } else if (result.mark !== undefined && result.mark !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['mark'],
      message: 'Only PRESENT results may have a numeric mark.',
    });
  }
});

export const saveAssessmentResultsSchema = z.object({
  results: z.array(resultSchema).min(1).max(500),
}).superRefine((data, ctx) => {
  const enrollmentIds = data.results.map((result) => result.enrollmentId);

  if (new Set(enrollmentIds).size !== enrollmentIds.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['results'],
      message: 'Each enrollment may appear only once per request.',
    });
  }
});
