
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  requireActiveSubscription,
  requirePlanCapacity
} from '../../middleware/require-active-subscription.js';

import {
  createTeacherController,
  listTeachersController,
  getTeacherByIdController,
  updateTeacherController,
  resendTeacherInvitationController,
  revokeTeacherInvitationController,
  acceptTeacherInvitationController,
} from './teachers.controller.js';

export const teachersRouter = Router();

// Public endpoint: the invitation token authorizes account setup.
teachersRouter.post(
  '/invitations/accept',
  acceptTeacherInvitationController
);

// School administrators manage records inside their tenant; platform admins may scope via X-School-ID.
teachersRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'));

teachersRouter.post('/', requirePlanCapacity('staff'), createTeacherController);
teachersRouter.get('/', listTeachersController);
teachersRouter.get('/:id', getTeacherByIdController);
teachersRouter.patch('/:id', updateTeacherController);

teachersRouter.post(
  '/:id/resend-invitation',
  resendTeacherInvitationController
);

teachersRouter.post(
  '/:id/revoke-invitation',
  revokeTeacherInvitationController
);
