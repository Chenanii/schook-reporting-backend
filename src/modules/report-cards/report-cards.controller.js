import { getReportCardPreview } from './report-cards.service.js';

export async function getReportCardPreviewController(req, res) {
  const reportCard = await getReportCardPreview(
    req.params.enrollmentId,
  );

  return res.status(200).json({
    success: true,
    message: reportCard.complete
      ? 'Report card preview retrieved successfully.'
      : 'Report card preview retrieved, but some subject results are not published.',
    data: reportCard,
  });
}