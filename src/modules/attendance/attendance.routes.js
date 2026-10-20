import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';
import {
  getAttendanceSheetController,
  attendanceReportController,
  listAttendanceClassesController,
  saveAttendanceController
} from './attendance.controller.js';

export const attendanceRouter = Router();

attendanceRouter.use(authenticate, requireActiveSubscription);
attendanceRouter.get('/classes', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER', 'TEACHER', 'FORM_TUTOR'), listAttendanceClassesController);
attendanceRouter.get('/reports', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), attendanceReportController);
attendanceRouter.get('/sheet', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER', 'TEACHER', 'FORM_TUTOR'), getAttendanceSheetController);
attendanceRouter.put('/sheet', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER', 'TEACHER', 'FORM_TUTOR'), saveAttendanceController);
