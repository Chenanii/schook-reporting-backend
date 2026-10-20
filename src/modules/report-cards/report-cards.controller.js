import { z } from 'zod';
import { getClassGroupReportCards, getEndOfTermReportPublication, getReportCardPreview, publishClassGroupEndOfTermReports, unpublishClassGroupEndOfTermReports } from './report-cards.service.js';

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
  const publication = await getEndOfTermReportPublication({
    termId: req.params.termId,
    classGroupId: req.params.classGroupId,
    schoolId: req.schoolId,
  });
  return res.status(200).json({
    success: true,
    message: 'Class group report cards retrieved successfully.',
    data: reportCards,
    publication,
  });
}

export async function publishClassGroupEndOfTermReportsController(req, res, next) {
  try {
    if (!['SCHOOL_ADMIN', 'SUPER_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'REPORT_PUBLICATION_FORBIDDEN', message: 'Only school administrators and examination staff can publish end-of-term reports.' } });
    }
    const data = await publishClassGroupEndOfTermReports({ termId: req.params.termId, classGroupId: req.params.classGroupId, schoolId: req.schoolId, actorId: req.user.id, req });
    return res.status(200).json({ success: true, message: 'End-of-term reports published successfully.', data });
  } catch (error) {
    next(error);
  }
}

export async function unpublishClassGroupEndOfTermReportsController(req, res, next) {
  try {
    if (!['SCHOOL_ADMIN', 'SUPER_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: { code: 'REPORT_PUBLICATION_FORBIDDEN', message: 'Only school administrators and examination staff can unpublish end-of-term reports.' } });
    }
    const data = await unpublishClassGroupEndOfTermReports({ termId: req.params.termId, classGroupId: req.params.classGroupId, schoolId: req.schoolId, actorId: req.user.id, req });
    return res.status(200).json({ success: true, message: data.unpublished ? 'End-of-term reports unpublished successfully.' : 'These end-of-term reports were already unpublished.', data });
  } catch (error) {
    next(error);
  }
}
