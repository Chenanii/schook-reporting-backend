
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';

import {
  createStaffController,
  listStaffController,
  getStaffController,
  updateStaffController
} from './users.controller.js';

export const usersRouter = Router();

usersRouter.use(authenticate, authorize('SUPER_ADMIN'));

usersRouter.post('/', createStaffController);
usersRouter.get('/', listStaffController);
usersRouter.get('/:id', getStaffController);
usersRouter.patch('/:id', updateStaffController);
