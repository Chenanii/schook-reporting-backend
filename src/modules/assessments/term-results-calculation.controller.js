import { z } from 'zod';
import { calculateTermSubjectResults } from './term-results-calculation.service.js';

const calculationQuerySchema = z.object({
  classGroupId: z.string().trim().min(1),
  subjectId: z.string().trim().min(1),
});

export async function calculateTermSubjectResultsController(req, res) {
  const parsed = calculationQuerySchema.safeParse(req.query);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'classGroupId and subjectId are required.',
        details: parsed.error.issues,
      },
    });
  }

  const results = await calculateTermSubjectResults({
    termId: req.params.termId,
    classGroupId: parsed.data.classGroupId,
    subjectId: parsed.data.subjectId,
    actorId: req.user.id,
    req,
  });

  return res.status(200).json({
    success: true,
    message: 'Term subject results calculated successfully.',
    count: results.length,
    data: results,
  });
}
