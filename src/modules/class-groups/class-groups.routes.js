
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

classGroupsRouter.use(authenticate, requireActiveSubscription);

classGroupsRouter.post('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), createClassGroupController);
classGroupsRouter.get('/', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN', 'HEADTEACHER', 'ACADEMIC_ADMIN', 'EXAMS_OFFICER'), listClassGroupsController);
classGroupsRouter.get('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), getClassGroupController);
classGroupsRouter.patch('/:id', authorize('SUPER_ADMIN', 'SCHOOL_ADMIN'), updateClassGroupController);
