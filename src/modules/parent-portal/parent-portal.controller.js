import { getParentPortalOverview } from './parent-portal.service.js';
import { getParentReportCard } from '../report-cards/report-cards.service.js';

export async function parentPortalOverviewController(req, res, next) {
  try {
    const data = await getParentPortalOverview(req.user.id, req.schoolId);
    return res.status(200).json({
      success: true,
      message: 'Parent portal information retrieved successfully.',
      data,
    });
  } catch (error) {
    return next(error);
  }
}

export async function parentReportCardController(req, res, next) {
  try {
    const data = await getParentReportCard(req.params.enrollmentId, req.user.id, req.schoolId);
    return res.status(200).json({ success: true, message: 'Published student report retrieved successfully.', data });
  } catch (error) {
    return next(error);
  }
}
