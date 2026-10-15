
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

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

// All management endpoints require an authenticated super administrator.
teachersRouter.use(authenticate, authorize('SUPER_ADMIN'));

teachersRouter.post('/', createTeacherController);
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
