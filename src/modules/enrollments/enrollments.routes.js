
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createEnrollmentController,
  listEnrollmentsController,
  getEnrollmentController,
  updateEnrollmentStatusController,
  updateEnrollmentClassGroupController,
  previewBulkEnrollmentController,
  createBulkEnrollmentsController,
  previewSelectedBulkEnrollmentController,
  createSelectedBulkEnrollmentsController,
  assignClassGroupBulkController
} from './enrollments.controller.js';

export const enrollmentsRouter = Router();

enrollmentsRouter.use(authenticate, requireActiveSubscription);
enrollmentsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), listEnrollmentsController);

enrollmentsRouter.use(authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER','ACADEMIC_ADMIN'));
enrollmentsRouter.post('/bulk/preview', previewBulkEnrollmentController);
enrollmentsRouter.post('/bulk', createBulkEnrollmentsController);
enrollmentsRouter.post('/bulk/selected/preview', previewSelectedBulkEnrollmentController);
enrollmentsRouter.post('/bulk/selected', createSelectedBulkEnrollmentsController);
enrollmentsRouter.post('/assign-class-group', assignClassGroupBulkController);
enrollmentsRouter.post('/', createEnrollmentController);
enrollmentsRouter.patch('/:id/status', updateEnrollmentStatusController);
enrollmentsRouter.patch('/:id/class-group', updateEnrollmentClassGroupController);
enrollmentsRouter.get('/:id', getEnrollmentController);
