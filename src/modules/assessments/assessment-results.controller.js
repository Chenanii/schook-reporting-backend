import { saveAssessmentResultsSchema } from './assessment-results.validation.js';
import {
  getAssessmentResultEntries,
  saveAssessmentResults
} from './assessment-results.service.js';

export async function getAssessmentResultsController(req, res) {
  const results = await getAssessmentResultEntries(req.params.id);
  return res.status(200).json({
    success: true,
    data: results,
    count: results.length
  });
}

export async function saveAssessmentResultsController(req, res) {
  const parsed = saveAssessmentResultsSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        details: parsed.error.issues,
      },
    });
  }

  const results = await saveAssessmentResults(
    req.params.id,
    parsed.data.results,
    req.user.id,
    req,
  );

  return res.status(200).json({
    success: true,
    message: 'Assessment results saved successfully.',
    data: results,
    count: results.length,
  });
}
