
import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { requireActiveSubscription } from '../../middleware/require-active-subscription.js';

import {
  createClassGroupController,
  listClassGroupsController,
  getClassGroupController,
  updateClassGroupController
} from './class-groups.controller.js';

export const classGroupsRouter = Router();

classGroupsRouter.use(authenticate, requireActiveSubscription, authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'));

classGroupsRouter.post('/', createClassGroupController);
classGroupsRouter.get('/', listClassGroupsController);
classGroupsRouter.get('/:id', getClassGroupController);
classGroupsRouter.patch('/:id', updateClassGroupController);
