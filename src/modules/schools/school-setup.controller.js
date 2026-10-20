import { getSchoolSetupStatus } from './school-setup.service.js';

export async function schoolSetupStatusController(req, res, next) {
  try {
    const data = await getSchoolSetupStatus(req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    return next(error);
  }
}
