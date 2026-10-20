import { z } from 'zod';
import {
  getMidTermReportCardPreview,
  getClassGroupMidTermReportCards,
  getMidTermReportPublication,
  publishClassGroupMidTermReports,
} from './mid-term-report-cards.service.js';

const idSchema = z.string().trim().min(1, 'ID is required.');

const enrollmentParamsSchema = z.object({ enrollmentId: idSchema });

const classGroupParamsSchema = z.object({
  termId: idSchema,
  classGroupId: idSchema,
});

// ?allowIncomplete=true returns cards with per-subject issues instead of a 409,
// so staff can see exactly which assessments or mid-term marks are still missing.
const querySchema = z.object({
  allowIncomplete: z.enum(['true', 'false']).optional().transform((value) => value === 'true'),
});

function validationError(res, message, issues) {
  return res.status(400).json({
    success: false,
    error: { code: 'VALIDATION_ERROR', message, details: issues },
  });
}

// Teachers (and form tutors) only see classes they are assigned to; admin roles see everything in their school.
function restrictedTeacherUserId(req) {
  return ['TEACHER', 'FORM_TUTOR'].includes(req.user?.role) ? req.user.id : null;
}

export async function getMidTermReportCardPreviewController(req, res, next) {
  try {
    const params = enrollmentParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(res, 'A valid enrollment id is required.', params.error.issues);
    const query = querySchema.safeParse(req.query);
    if (!query.success) return validationError(res, 'Invalid query parameters.', query.error.issues);

    const data = await getMidTermReportCardPreview(params.data.enrollmentId, {
      schoolId: req.schoolId,
      teacherUserId: restrictedTeacherUserId(req),
      allowIncomplete: query.data.allowIncomplete,
    });
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function getClassGroupMidTermReportCardsController(req, res, next) {
  try {
    const params = classGroupParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(res, 'A valid term and class group are required.', params.error.issues);
    const query = querySchema.safeParse(req.query);
    if (!query.success) return validationError(res, 'Invalid query parameters.', query.error.issues);

    const data = await getClassGroupMidTermReportCards({
      termId: params.data.termId,
      classGroupId: params.data.classGroupId,
      schoolId: req.schoolId,
      teacherUserId: restrictedTeacherUserId(req),
      allowIncomplete: query.data.allowIncomplete,
    });
    const publication = await getMidTermReportPublication({
      termId: params.data.termId,
      classGroupId: params.data.classGroupId,
      schoolId: req.schoolId,
    });
    return res.status(200).json({ success: true, data, publication });
  } catch (error) {
    next(error);
  }
}

export async function publishClassGroupMidTermReportsController(req, res, next) {
  try {
    const params = classGroupParamsSchema.safeParse(req.params);
    if (!params.success) return validationError(res, 'A valid term and class group are required.', params.error.issues);
    const publication = await publishClassGroupMidTermReports({
      ...params.data,
      schoolId: req.schoolId,
      actorId: req.user.id,
      req,
    });
    return res.status(200).json({ success: true, message: 'Mid-term reports published successfully.', data: publication });
  } catch (error) {
    next(error);
  }
}
