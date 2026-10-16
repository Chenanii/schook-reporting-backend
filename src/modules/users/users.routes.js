
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import {
  requireActiveSubscription,
  requirePlanCapacity
} from '../../middleware/require-active-subscription.js';

import {
  createStaffController,
  listStaffController,
  getStaffController,
  updateStaffController
} from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER'));

usersRouter.post('/', requirePlanCapacity('staff'), createStaffController);
usersRouter.get('/', listStaffController);
usersRouter.get('/:id', getStaffController);
usersRouter.patch('/:id', updateStaffController);
