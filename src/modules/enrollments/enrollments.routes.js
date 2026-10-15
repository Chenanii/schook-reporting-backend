
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createEnrollmentController,
  listEnrollmentsController,
  getEnrollmentController,
  updateEnrollmentStatusController,
  previewBulkEnrollmentController,
  createBulkEnrollmentsController
} from './enrollments.controller.js';

export const enrollmentsRouter = Router();

enrollmentsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'));

enrollmentsRouter.post('/bulk/preview', previewBulkEnrollmentController);
enrollmentsRouter.post('/bulk', createBulkEnrollmentsController);
enrollmentsRouter.post('/', createEnrollmentController);
enrollmentsRouter.get('/', listEnrollmentsController);
enrollmentsRouter.patch('/:id/status', updateEnrollmentStatusController);
enrollmentsRouter.get('/:id', getEnrollmentController);
