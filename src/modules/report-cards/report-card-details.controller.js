import { saveReportCardDetails, reportCardDetailsSchema } from './report-card-details.service.js';

export function saveReportCardDetailsController(reportType) {
  return async (req, res, next) => {
    try {
      const parsed = reportCardDetailsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Enter valid report details.', details: parsed.error.issues } });
      }
      const data = await saveReportCardDetails({
        enrollmentId: req.params.enrollmentId,
        schoolId: req.schoolId,
        reportType,
        userId: req.user.id,
        role: req.user.role,
        data: parsed.data,
      });
      return res.status(200).json({ success: true, message: 'Report details saved.', data });
    } catch (error) {
      return next(error);
    }
  };
}
