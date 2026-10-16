import { z } from 'zod';
import { getStudentStreamRoster, saveStudentStreamRoster } from './student-streams.service.js';

const rosterSchema = z.object({
  enrollmentIds: z.array(z.string().trim().min(1)).max(1000)
    .refine((ids) => new Set(ids).size === ids.length, 'Duplicate student enrollments are not allowed.'),
}).strict();

export async function getStudentStreamRosterController(req, res, next) {
  try {
    const data = await getStudentStreamRoster(req.params.assignmentId, req.schoolId);
    return res.status(200).json({ success: true, data });
  } catch (error) {
    next(error);
  }
}

export async function saveStudentStreamRosterController(req, res, next) {
  try {
    const parsed = rosterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'A valid list of student enrollments is required.', details: parsed.error.issues },
      });
    }
    const data = await saveStudentStreamRoster(req.params.assignmentId, parsed.data.enrollmentIds, req.schoolId);
    return res.status(200).json({ success: true, message: 'Subject stream students updated.', data });
  } catch (error) {
    next(error);
  }
}
