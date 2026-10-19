import { attendanceClassesSchema, attendanceSheetQuerySchema, saveAttendanceSchema } from './attendance.validation.js';
import { getAttendanceSheet, listAttendanceClasses, saveAttendance } from './attendance.service.js';

function validationError(res, error) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues }
  });
}

export async function listAttendanceClassesController(req, res, next) {
  try {
    const parsed = attendanceClassesSchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await listAttendanceClasses(parsed.data.termId, parsed.data.date, req.user, req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getAttendanceSheetController(req, res, next) {
  try {
    const parsed = attendanceSheetQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await getAttendanceSheet(parsed.data, req.user, req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function saveAttendanceController(req, res, next) {
  try {
    const parsed = saveAttendanceSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const data = await saveAttendance(parsed.data, req.user, req.schoolId, req);
    return res.status(200).json({ success: true, message: 'Class attendance saved.', data });
  } catch (error) {
    next(error);
  }
}
