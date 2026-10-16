import { getClassGroupReportCards, getReportCardPreview } from './report-cards.service.js';

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
  const reportCards = await getClassGroupReportCards({
    termId: req.params.termId,
    classGroupId: req.params.classGroupId,
    schoolId: req.schoolId,
    teacherUserId: req.user.role === 'TEACHER' ? req.user.id : null,
  });
  return res.status(200).json({
    success: true,
    message: 'Class group report cards retrieved successfully.',
    data: reportCards,
  });
}
