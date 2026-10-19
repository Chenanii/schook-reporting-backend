import { z } from 'zod';
import { getClassGroupReportCards, getReportCardPreview } from './report-cards.service.js';

const querySchema = z.object({
  allowIncomplete: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
}).strict();

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Invalid query parameters.', details: error.issues },
  });
}

export async function getReportCardPreviewController(req, res) {
  const reportCard = await getReportCardPreview(
    req.params.enrollmentId,
    req.user.role === 'TEACHER' ? req.user.id : null,
  );

  return res.status(200).json({
    success: true,
    message: reportCard.complete
      ? 'Report card preview retrieved successfully.'
      : 'Report card preview retrieved, but some subject results are not published.',
    data: reportCard,
  });
}

export async function getClassGroupReportCardsController(req, res) {
  const query = querySchema.safeParse(req.query);
  if (!query.success) return validationError(res, query.error);
  const reportCards = await getClassGroupReportCards({
    termId: req.params.termId,
    classGroupId: req.params.classGroupId,
    schoolId: req.schoolId,
    teacherUserId: req.user.role === 'TEACHER' ? req.user.id : null,
    allowIncomplete: query.data.allowIncomplete,
  });
  return res.status(200).json({
    success: true,
    message: 'Class group report cards retrieved successfully.',
    data: reportCards,
  });
}
